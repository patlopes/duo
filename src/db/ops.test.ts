import { accountBalance } from '../domain/balances';
import { computeSettlement } from '../domain/split';
import { createDatabase, readSettings, type DuoDatabase } from './database';
import {
  adjustBalance,
  bootstrap,
  closeMonth,
  createTransaction,
  createTransfer,
  deleteTransaction,
  deleteTransfer,
  ensureJointAccount,
  recordJointDeposit,
  restoreTransfer,
  loadSplitContext,
  payInvoice,
  reopenMonth,
  setBudget,
  stamp,
  syncRecurrences,
  toggleStatus,
  undoDeleteTransaction,
  updateSettings,
  updateTransaction,
  upsert,
  type TransactionDraft,
} from './ops';
import type { Account, CreditCard, MemberIncome } from '../schemas/entities';

let database: DuoDatabase;
let account: Account;
let card: CreditCard;
let categoryId: string;

const NOW = '2026-11-06';

const draft = (over: Partial<TransactionDraft> = {}): TransactionDraft => ({
  kind: 'expense',
  amountCents: 10_000,
  description: 'Mercado',
  date: '2026-11-05',
  accountId: account.id,
  cardId: null,
  categoryId,
  tagIds: [],
  status: 'paid',
  notes: '',
  payerMemberId: null,
  splitRule: 'proportional',
  goalId: null,
  goalItemId: null,
  ...over,
});

const liveTx = async () => (await database.transactions.toArray()).filter((t) => !t.deletedAt);

beforeEach(async () => {
  database = createDatabase(`test-${crypto.randomUUID()}`);
  await bootstrap(database);
  const household = (await database.households.toCollection().first())!;
  categoryId = (await database.categories.toArray()).find((c) => c.name === 'Mercado')!.id;
  account = await upsert<Account>(
    'accounts',
    {
      name: 'Conta',
      type: 'checking',
      ownerMemberId: household.memberIds[0],
      initialBalanceCents: 100_000,
      color: '#000',
      icon: 'bank',
      includeInTotal: true,
      archived: false,
    },
    database,
  );
  card = await upsert<CreditCard>(
    'cards',
    {
      name: 'Cartão',
      brand: 'Visa',
      limitCents: 500_000,
      closingDay: 3,
      dueDay: 10,
      paymentAccountId: account.id,
      ownerMemberId: household.memberIds[0],
      color: '#000',
      archived: false,
    },
    database,
  );
});

afterEach(async () => {
  await database.delete();
});

describe('bootstrap e ajustes', () => {
  it('não duplica ao rodar duas vezes', async () => {
    await bootstrap(database);
    expect(await database.households.count()).toBe(1);
    expect(await database.members.count()).toBe(2);
    const cats = await database.categories.toArray();
    expect(cats.filter((c) => c.name === 'Mercado')).toHaveLength(1);
    expect(cats.some((c) => c.system)).toBe(true);
  });

  it('settings: padrão, merge e blocos novos', async () => {
    expect((await readSettings(database)).theme).toBe('system');
    await updateSettings({ theme: 'dark' }, database);
    await updateSettings({ hideValues: true }, database);
    const s = await readSettings(database);
    expect(s.theme).toBe('dark');
    expect(s.hideValues).toBe(true);
    await database.settings.put({ ...s, homeBlocks: ['summary'] });
    expect((await readSettings(database)).homeBlocks).toContain('couple');
  });
});

describe('criar lançamentos', () => {
  it('recusa valor zero e conta e cartão ao mesmo tempo', async () => {
    await expect(createTransaction(draft({ amountCents: 0 }), database)).rejects.toThrow();
    await expect(createTransaction(draft({ cardId: card.id }), database)).rejects.toThrow();
    await expect(createTransaction(draft({ accountId: null }), database)).rejects.toThrow();
  });

  it('compra no cartão calcula a fatura e fica pendente', async () => {
    const [id] = await createTransaction(
      draft({ accountId: null, cardId: card.id, date: '2026-11-03' }),
      database,
    );
    const row = (await database.transactions.get(id!))!;
    expect(row.invoiceMonth).toBe('2026-12');
    expect(row.status).toBe('pending');
    expect(accountBalance(account, [row], [])).toBe(100_000);
  });

  it('parcela em 6× no cartão', async () => {
    const ids = await createTransaction(
      draft({
        accountId: null,
        cardId: card.id,
        amountCents: 270_000,
        date: '2026-11-02',
        repeat: { mode: 'installments', count: 6 },
      }),
      database,
    );
    expect(ids).toHaveLength(6);
    const rows = await liveTx();
    expect(new Set(rows.map((r) => r.installmentGroupId)).size).toBe(1);
    expect(rows.map((r) => r.invoiceMonth).sort()[5]).toBe('2027-04');
    expect(rows.every((r) => r.amountCents === 45_000)).toBe(true);
  });

  it('parcela em conta: só a primeira pode estar paga', async () => {
    await createTransaction(draft({ repeat: { mode: 'installments', count: 3 } }), database);
    const rows = (await liveTx()).sort((a, b) => a.installmentNumber! - b.installmentNumber!);
    expect(rows.map((r) => r.status)).toEqual(['paid', 'pending', 'pending']);
    expect(rows[2]!.date).toBe('2027-01-05');
  });

  it('recorrência gera 12 meses à frente e completa sem duplicar', async () => {
    await createTransaction(
      draft({ repeat: { mode: 'recurring', frequency: 'monthly', endDate: null } }),
      database,
      NOW,
    );
    const rows = await liveTx();
    expect(rows).toHaveLength(13);
    expect(rows.filter((r) => r.status === 'paid')).toHaveLength(1);
    expect(await syncRecurrences(database, NOW)).toBe(0);
    expect(await syncRecurrences(database, '2027-01-02')).toBe(2);
    expect(await liveTx()).toHaveLength(15);
  });
});

describe('editar e excluir com escopo', () => {
  let ids: string[];

  beforeEach(async () => {
    ids = await createTransaction(draft({ repeat: { mode: 'installments', count: 4 } }), database);
  });

  const amounts = async () =>
    (await liveTx())
      .sort((a, b) => a.installmentNumber! - b.installmentNumber!)
      .map((r) => r.amountCents);

  it('só esta', async () => {
    await updateTransaction(ids[1]!, { amountCents: 1 }, 'one', database);
    expect(await amounts()).toEqual([2500, 1, 2500, 2500]);
  });

  it('esta e as próximas', async () => {
    await updateTransaction(ids[1]!, { amountCents: 1 }, 'forward', database);
    expect(await amounts()).toEqual([2500, 1, 1, 1]);
  });

  it('todas', async () => {
    await updateTransaction(ids[1]!, { amountCents: 1 }, 'all', database);
    expect(await amounts()).toEqual([1, 1, 1, 1]);
  });

  it('a data só muda na linha editada', async () => {
    await updateTransaction(ids[0]!, { date: '2026-11-20', amountCents: 7 }, 'all', database);
    const rows = (await liveTx()).sort((a, b) => a.installmentNumber! - b.installmentNumber!);
    expect(rows[0]!.date).toBe('2026-11-20');
    expect(rows[1]!.date).toBe('2026-12-05');
    expect(rows[1]!.amountCents).toBe(7);
  });

  it('excluir esta e as próximas, e desfazer', async () => {
    const { ids: removed, recurrence } = await deleteTransaction(ids[2]!, 'forward', database);
    expect(removed).toHaveLength(2);
    expect(await liveTx()).toHaveLength(2);
    await undoDeleteTransaction(removed, recurrence, database);
    expect(await liveTx()).toHaveLength(4);
  });

  it('excluir recorrência para de gerar', async () => {
    const [first] = await createTransaction(
      draft({
        description: 'Luz',
        repeat: { mode: 'recurring', frequency: 'monthly', endDate: null },
      }),
      database,
      NOW,
    );
    await deleteTransaction(first!, 'all', database);
    expect(await syncRecurrences(database, '2030-01-01')).toBe(0);
    const luz = (await liveTx()).filter((t) => t.description === 'Luz');
    expect(luz).toHaveLength(0);
  });

  it('excluir daqui em diante encerra a recorrência', async () => {
    await createTransaction(
      draft({
        description: 'Net',
        repeat: { mode: 'recurring', frequency: 'monthly', endDate: null },
      }),
      database,
      NOW,
    );
    const net = (await liveTx())
      .filter((t) => t.description === 'Net')
      .sort((a, b) => a.date.localeCompare(b.date));
    await deleteTransaction(net[3]!.id, 'forward', database);
    expect(await syncRecurrences(database, '2030-01-01')).toBe(0);
    expect((await liveTx()).filter((t) => t.description === 'Net')).toHaveLength(3);
    const rec = (await database.recurrences.toArray())[0]!;
    expect(rec.endDate).toBe('2027-02-04');
  });

  it('marcar como pago alterna o status', async () => {
    await toggleStatus(ids[1]!, database);
    expect((await database.transactions.get(ids[1]!))!.status).toBe('paid');
    await toggleStatus(ids[1]!, database);
    expect((await database.transactions.get(ids[1]!))!.status).toBe('pending');
  });

  it('editar a recorrência em "todas" atualiza o modelo das próximas', async () => {
    await createTransaction(
      draft({
        description: 'Gás',
        repeat: { mode: 'recurring', frequency: 'monthly', endDate: null },
      }),
      database,
      NOW,
    );
    const gas = (await liveTx()).find((t) => t.description === 'Gás')!;
    await updateTransaction(gas.id, { amountCents: 123 }, 'all', database);
    await syncRecurrences(database, '2027-01-02');
    const later = (await liveTx())
      .filter((t) => t.description === 'Gás')
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)!;
    expect(later.date > '2027-12-01').toBe(true);
    expect(later.amountCents).toBe(123);
  });
});

describe('fatura e ajuste', () => {
  it('pagar fatura: parcial não baixa, total baixa os lançamentos', async () => {
    await createTransaction(
      draft({ accountId: null, cardId: card.id, date: '2026-11-02', amountCents: 40_000 }),
      database,
    );
    await payInvoice(card, '2026-11', 10_000, account.id, NOW, database);
    expect((await liveTx())[0]!.status).toBe('pending');
    await payInvoice(card, '2026-11', 30_000, account.id, NOW, database);
    expect((await liveTx())[0]!.status).toBe('paid');
    const transfers = await database.transfers.toArray();
    expect(accountBalance(account, await liveTx(), transfers)).toBe(60_000);
  });

  it('excluir o pagamento reabre a fatura, e desfazer baixa de novo', async () => {
    await createTransaction(
      draft({ accountId: null, cardId: card.id, date: '2026-11-02', amountCents: 40_000 }),
      database,
    );
    await payInvoice(card, '2026-11', 40_000, account.id, NOW, database);
    const [payment] = await database.transfers.toArray();
    await deleteTransfer(payment!.id, database);
    expect((await liveTx())[0]!.status).toBe('pending');
    await restoreTransfer(payment!.id, database);
    expect((await liveTx())[0]!.status).toBe('paid');
  });

  it('transferência exige contas diferentes e valor', async () => {
    await expect(
      createTransfer(
        { kind: 'transfer', fromAccountId: 'a', toAccountId: 'a', amountCents: 1, date: NOW },
        database,
      ),
    ).rejects.toThrow();
    await expect(
      createTransfer(
        { kind: 'transfer', fromAccountId: 'a', toAccountId: 'b', amountCents: 0, date: NOW },
        database,
      ),
    ).rejects.toThrow();
  });

  it('ajuste de saldo cria a diferença e não cria nada se bater', async () => {
    await adjustBalance(account, 130_000, database, NOW);
    let rows = await liveTx();
    expect(rows[0]!.kind).toBe('income');
    expect(rows[0]!.amountCents).toBe(30_000);
    expect(rows[0]!.source).toBe('adjustment');
    expect(accountBalance(account, rows, [])).toBe(130_000);
    await adjustBalance(account, 130_000, database, NOW);
    expect(await liveTx()).toHaveLength(1);
    await adjustBalance(account, 120_000, database, NOW);
    rows = await liveTx();
    expect(accountBalance(account, rows, [])).toBe(120_000);
  });

  it('orçamento: atualiza em vez de duplicar', async () => {
    await setBudget(categoryId, null, 100, database);
    await setBudget(categoryId, null, 200, database);
    await setBudget(categoryId, '2026-11', 300, database);
    const rows = await database.budgets.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find((b) => b.month === null)!.amountCents).toBe(200);
  });
});

describe('fechar mês', () => {
  it('congela o % mesmo que a renda mude, e reabrir descongela', async () => {
    const household = (await database.households.toCollection().first())!;
    const [a, b] = household.memberIds;
    const income = (memberId: string, amountCents: number): MemberIncome => ({
      ...stamp(household.id),
      memberId,
      competenceMonth: '2026-11',
      type: 'salary',
      amountCents,
      countsForSplit: true,
    });
    await database.incomes.bulkPut([income(a, 800_000), income(b, 200_000)]);
    await createTransaction(draft({ amountCents: 100_000 }), database);
    const close = await closeMonth('2026-11', database);
    expect(close.pctByMember[a]).toBeCloseTo(0.8);
    expect(close.settlement).toEqual({ fromMemberId: b, toMemberId: a, amountCents: 20_000 });

    await database.incomes.bulkPut([income(b, 800_000)]);
    let ctx = await loadSplitContext(database);
    expect(computeSettlement(ctx, '2026-11').pctA).toBeCloseTo(0.8);

    await reopenMonth('2026-11', database);
    ctx = await loadSplitContext(database);
    expect(computeSettlement(ctx, '2026-11').pctA).toBeCloseTo(8 / 18);

    const again = await closeMonth('2026-11', database);
    expect(again.reopenedAt).toBeNull();
    expect(await database.closes.count()).toBe(1);
  });
});

describe('contas da casa', () => {
  it('cria a conjunta só uma vez', async () => {
    const a = await ensureJointAccount(database);
    const b = await ensureJointAccount(database);
    expect(a.id).toBe(b.id);
    expect(a.type).toBe('joint');
  });

  it('o depósito registra de quem veio e não duplica contas', async () => {
    const household = (await database.households.toCollection().first())!;
    const member = household.memberIds[1];
    const first = await recordJointDeposit(member, 5_000, '2026-11', NOW, database);
    const second = await recordJointDeposit(member, 1_000, '2026-11', NOW, database);
    expect(first.fromAccountId).toBe(second.fromAccountId);
    const own = await database.accounts.get(first.fromAccountId);
    expect(own!.ownerMemberId).toBe(member);
    expect(own!.includeInTotal).toBe(false);
    expect(first.kind).toBe('joint_deposit');
  });

  it('a mesma ocorrência gerada em dois aparelhos tem o mesmo id', async () => {
    await createTransaction(
      draft({
        description: 'Aluguel',
        repeat: { mode: 'recurring', frequency: 'monthly', endDate: null },
      }),
      database,
      NOW,
    );
    await syncRecurrences(database, '2027-01-02');
    const rows = (await liveTx()).filter((t) => t.description === 'Aluguel');
    const rec = (await database.recurrences.toArray())[0]!;
    expect(rows.every((t) => t.id === `${rec.id}:${t.date}`)).toBe(true);
    expect(new Set(rows.map((t) => t.id)).size).toBe(rows.length);
  });
});
