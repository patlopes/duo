import { createDatabase, readSettings, type DuoDatabase } from '../db/database';
import {
  bootstrap,
  createTransaction,
  ensureJointAccount,
  softDelete,
  updateSettings,
  updateTransaction,
  upsert,
  type TransactionDraft,
} from '../db/ops';
import type { Account, Member, SalaryPlan } from '../schemas/entities';
import {
  connectAccount,
  joinSheet,
  OtherHouseholdError,
  releaseMember,
  syncWithSheet,
  type CoupleDrive,
  type SheetCells,
  type SheetStore,
} from './sheetSync';

class FakeSheet implements SheetStore {
  rows: string[][] = [];
  writes = 0;
  async read() {
    return this.rows.map((r) => [...r]);
  }
  async append(rows: SheetCells[]) {
    this.writes += rows.length;
    this.rows.push(...rows);
  }
  async update(updates: { rowNumber: number; cells: SheetCells }[]) {
    this.writes += updates.length;
    for (const { rowNumber, cells } of updates) this.rows[rowNumber - 2] = cells;
  }
}

let sheet: FakeSheet;
let phoneA: DuoDatabase;
let phoneB: DuoDatabase;

const tick = () => new Promise((r) => setTimeout(r, 3));
const live = async (d: DuoDatabase) => (await d.transactions.toArray()).filter((t) => !t.deletedAt);
const names = async (d: DuoDatabase) => (await live(d)).map((t) => t.description).sort();

async function bill(d: DuoDatabase, description: string, over: Partial<TransactionDraft> = {}) {
  const joint = await ensureJointAccount(d);
  const category = (await d.categories.toArray()).find((c) => c.name === 'Moradia')!;
  await tick();
  await createTransaction(
    {
      kind: 'expense',
      amountCents: 100_000,
      description,
      date: '2026-11-05',
      accountId: joint.id,
      cardId: null,
      categoryId: category.id,
      tagIds: [],
      status: 'pending',
      notes: '',
      payerMemberId: null,
      splitRule: 'proportional',
      goalId: null,
      goalItemId: null,
      ...over,
    },
    d,
    '2026-11-06',
  );
  return (await d.transactions.toArray()).find((t) => t.description === description)!;
}

beforeEach(async () => {
  sheet = new FakeSheet();
  phoneA = createDatabase(`a-${crypto.randomUUID()}`);
  phoneB = createDatabase(`b-${crypto.randomUUID()}`);
  await bootstrap(phoneA);
  await tick();
  await bootstrap(phoneB);
  const [first] = await phoneA.members.toArray();
  await upsert<Member>('members', { ...(first as Member), name: 'Patrick' }, phoneA);
});

afterEach(async () => {
  await phoneA.delete();
  await phoneB.delete();
});

async function linkBoth() {
  await syncWithSheet(sheet, phoneA);
  await joinSheet(sheet, 1, 'sheet-1', phoneB);
}

describe('planilha do casal', () => {
  it('quem entra recebe tudo e o que já tinha vai para o outro celular', async () => {
    await bill(phoneA, 'Aluguel');
    await bill(phoneB, 'Internet');
    await linkBoth();
    expect(await names(phoneB)).toEqual(['Aluguel', 'Internet']);

    await syncWithSheet(sheet, phoneA);
    expect(await names(phoneA)).toEqual(['Aluguel', 'Internet']);
    expect((await readSettings(phoneB)).googleSheetId).toBe('sheet-1');
    expect((await readSettings(phoneB)).deviceMemberIndex).toBe(1);
  });

  it('repetir a sincronização não escreve nada', async () => {
    await bill(phoneA, 'Aluguel');
    await linkBoth();
    await syncWithSheet(sheet, phoneA);
    const writes = sheet.writes;
    expect(await syncWithSheet(sheet, phoneA)).toEqual({ received: 0, sent: 0 });
    expect(await syncWithSheet(sheet, phoneB)).toEqual({ received: 0, sent: 0 });
    expect(sheet.writes).toBe(writes);
  });

  it('a edição mais recente vence, nos dois celulares', async () => {
    const row = await bill(phoneA, 'Aluguel');
    await linkBoth();
    await tick();
    await updateTransaction(row.id, { amountCents: 200_000 }, 'one', phoneA);
    await tick();
    await updateTransaction(row.id, { amountCents: 300_000 }, 'one', phoneB);
    await syncWithSheet(sheet, phoneA);
    await syncWithSheet(sheet, phoneB);
    await syncWithSheet(sheet, phoneA);
    expect((await phoneA.transactions.get(row.id))?.amountCents).toBe(300_000);
    expect((await phoneB.transactions.get(row.id))?.amountCents).toBe(300_000);
  });

  it('excluir em um celular exclui no outro e apaga o conteúdo da planilha', async () => {
    const row = await bill(phoneA, 'Academia do casal');
    await linkBoth();
    await tick();
    await softDelete('transactions', row.id, phoneB);
    await syncWithSheet(sheet, phoneB);
    await syncWithSheet(sheet, phoneA);
    expect(await names(phoneA)).toEqual([]);
    expect(JSON.stringify(sheet.rows)).not.toContain('Academia do casal');
  });

  it('conta de uma pessoa só nunca vai para a planilha', async () => {
    await bill(phoneA, 'Presente surpresa', { splitRule: 'memberA' });
    await linkBoth();
    expect(JSON.stringify(sheet.rows)).not.toContain('Presente surpresa');
    expect(await names(phoneB)).toEqual([]);
    expect(await names(phoneA)).toEqual(['Presente surpresa']);
  });

  it('conta que vira de uma pessoa só some do outro celular e da planilha', async () => {
    const row = await bill(phoneA, 'Spotify');
    await linkBoth();
    await tick();
    await updateTransaction(row.id, { splitRule: 'memberA' }, 'one', phoneA);
    await syncWithSheet(sheet, phoneA);
    await syncWithSheet(sheet, phoneB);
    expect(JSON.stringify(sheet.rows)).not.toContain('Spotify');
    expect(await names(phoneB)).toEqual([]);
    expect(await names(phoneA)).toEqual(['Spotify']);
  });

  it('o modo de divisão vale para os dois', async () => {
    await linkBoth();
    await updateSettings({ splitMode: 'equal', splitModeAt: new Date().toISOString() }, phoneA);
    await syncWithSheet(sheet, phoneA);
    await syncWithSheet(sheet, phoneB);
    expect((await readSettings(phoneB)).splitMode).toBe('equal');
  });

  it('célula editada à mão não trava nada e é consertada', async () => {
    const row = await bill(phoneA, 'Aluguel');
    await linkBoth();
    await syncWithSheet(sheet, phoneA);
    const index = sheet.rows.findIndex((r) => r[1] === row.id);
    sheet.rows[index]![4] = '{oops';
    sheet.rows.push(['transactions', 'lixo', '2099-01-01', '', 'nada']);
    await syncWithSheet(sheet, phoneA);
    expect(await names(phoneA)).toEqual(['Aluguel']);
    expect(sheet.rows[index]![4]).toContain('Aluguel');
  });

  it('com a mesma linha duas vezes, vale a cópia mais nova', async () => {
    const row = await bill(phoneA, 'Aluguel');
    await linkBoth();
    await syncWithSheet(sheet, phoneA);
    const copy = sheet.rows.find((r) => r[1] === row.id)!;
    const newer = JSON.parse(copy[4]!);
    newer.amountCents = 777;
    newer.updatedAt = '2099-01-01T00:00:00.000Z';
    sheet.rows.push(['transactions', row.id, newer.updatedAt, '', JSON.stringify(newer)]);
    await syncWithSheet(sheet, phoneB);
    expect((await phoneB.transactions.get(row.id))?.amountCents).toBe(777);
  });

  it('recusa misturar com a planilha de outro casal', async () => {
    await syncWithSheet(sheet, phoneA);
    await expect(syncWithSheet(sheet, phoneB)).rejects.toBeInstanceOf(OtherHouseholdError);
    expect(await names(phoneB)).toEqual([]);
  });

  describe('entrar com o Google', () => {
    const drive = (found: string | null): CoupleDrive & { created: number } => ({
      created: 0,
      async find() {
        return found;
      },
      async create() {
        this.created += 1;
        return 'new-sheet';
      },
      store: () => sheet,
    });

    it('sem planilha, cria uma e sobe os dados', async () => {
      await bill(phoneA, 'Aluguel');
      const google = drive(null);
      expect(await connectAccount(google, 'a@x.com', null, phoneA)).toBe('created');
      expect(google.created).toBe(1);
      expect((await readSettings(phoneA)).googleSheetId).toBe('new-sheet');
      expect(JSON.stringify(sheet.rows)).toContain('Aluguel');
    });

    it('num aparelho novo com a mesma conta, é só entrar e ver os dados', async () => {
      await bill(phoneA, 'Aluguel');
      await connectAccount(drive(null), 'a@x.com', null, phoneA);

      const google = drive('new-sheet');
      expect(await connectAccount(google, 'a@x.com', null, phoneB)).toBe('joined');
      expect(google.created).toBe(0);
      expect(await names(phoneB)).toEqual(['Aluguel']);
      const settings = await readSettings(phoneB);
      expect(settings.onboarded).toBe(true);
      expect(settings.deviceMemberIndex).toBe(0);
      expect(settings.googleSheetId).toBe('new-sheet');
    });

    it('quem abre o convite vira a outra pessoa do casal, sem perguntar', async () => {
      await connectAccount(drive(null), 'a@x.com', null, phoneA);
      expect(await connectAccount(drive(null), 'b@x.com', 'new-sheet', phoneB)).toBe('joined');
      expect((await readSettings(phoneB)).deviceMemberIndex).toBe(1);

      await syncWithSheet(sheet, phoneA);
      expect((await readSettings(phoneA)).googleEmails).toEqual(['a@x.com', 'b@x.com']);
    });

    it('um aparelho novo não apaga o saldo nem o salário de quem já usava', async () => {
      const jointA = await ensureJointAccount(phoneA);
      await upsert<Account>('accounts', { ...jointA, initialBalanceCents: 500_000 }, phoneA);
      const [memberA] = await phoneA.members.toArray();
      await upsert<SalaryPlan>(
        'salaryPlans',
        { memberId: memberA!.id, amountCents: 900_000, payDay: 5, startMonth: '2026-11' },
        phoneA,
      );
      await connectAccount(drive(null), 'a@x.com', null, phoneA);

      // Created afterwards, so a plain "newest wins" would have let these defaults overwrite the real ones.
      await tick();
      await ensureJointAccount(phoneB);
      const [memberB] = await phoneB.members.toArray();
      await upsert<SalaryPlan>(
        'salaryPlans',
        { memberId: memberB!.id, amountCents: 1, payDay: 5, startMonth: '2026-11' },
        phoneB,
      );
      await connectAccount(drive('new-sheet'), 'a@x.com', null, phoneB);
      await syncWithSheet(sheet, phoneA);

      for (const phone of [phoneA, phoneB]) {
        const joint = (await phone.accounts.toArray()).filter((a) => a.type === 'joint');
        expect(joint.map((a) => a.initialBalanceCents)).toEqual([500_000]);
        const plans = (await phone.salaryPlans.toArray()).filter((p) => !p.deletedAt);
        expect(plans.map((p) => p.amountCents)).toEqual([900_000]);
      }
    });

    it('quem entrou com a conta errada devolve o lugar para a pessoa certa', async () => {
      await connectAccount(drive(null), 'a@x.com', null, phoneA);
      await connectAccount(drive(null), 'errada@x.com', 'new-sheet', phoneB);
      expect((await readSettings(phoneB)).deviceMemberIndex).toBe(1);

      await releaseMember(sheet, 'errada@x.com');
      await syncWithSheet(sheet, phoneA);
      expect((await readSettings(phoneA)).googleEmails).toEqual(['a@x.com', null]);

      await tick();
      await connectAccount(drive(null), 'b@x.com', 'new-sheet', phoneB);
      await syncWithSheet(sheet, phoneA);
      expect((await readSettings(phoneA)).googleEmails).toEqual(['a@x.com', 'b@x.com']);
      expect((await readSettings(phoneB)).deviceMemberIndex).toBe(1);
    });

    it('entrar de novo no mesmo aparelho não cria nada', async () => {
      await connectAccount(drive(null), 'a@x.com', null, phoneA);
      const google = drive(null);
      expect(await connectAccount(google, 'a@x.com', null, phoneA)).toBe('already');
      expect(google.created).toBe(0);
    });
  });
});
