import type { Data } from '../db/DataContext';
import { createDatabase, readSettings, type DuoDatabase } from '../db/database';
import { bootstrap, closeMonth, createTransaction, stamp, updateSettings, upsert } from '../db/ops';
import { checkHealth } from '../domain/health';
import type { Account, CreditCard, Goal, Member, Transaction } from '../schemas/entities';
import { AI_TASKS, buildAiPackage, jsonSchemas } from './aiExport';
import {
  backupToFile,
  buildBackup,
  markBackupDone,
  parseBackupFile,
  restoreBackup,
} from './backup';
import {
  applyPlan,
  ChangesetSchema,
  exportTimeOf,
  extractJson,
  parseChangeset,
  planChangeset,
  summarizeCounts,
  undoImport,
  type Changeset,
} from './changeset';
import {
  applyImport,
  buildReview,
  decodeStatement,
  guessMapping,
  parseCsv,
  parseDateText,
  parseOfx,
  rowsFromCsv,
} from './statements';

let database: DuoDatabase;
let account: Account;
let card: CreditCard;
let categoryId: string;
let incomeCategoryId: string;

beforeEach(async () => {
  database = createDatabase(`io-${crypto.randomUUID()}`);
  await bootstrap(database);
  const cats = await database.categories.toArray();
  categoryId = cats.find((c) => c.name === 'Mercado')!.id;
  incomeCategoryId = cats.find((c) => c.name === 'Salário')!.id;
  const household = (await database.households.toCollection().first())!;
  account = await upsert<Account>(
    'accounts',
    {
      name: 'Conta',
      type: 'checking',
      ownerMemberId: household.memberIds[0],
      initialBalanceCents: 0,
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
      brand: '',
      limitCents: 100_000,
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

const changeset = (
  operations: Changeset['operations'],
  over: Partial<Changeset> = {},
): Changeset => ({
  format: 'duo-changeset',
  schemaVersion: 1,
  operations,
  ...over,
});

const expense = (over: Record<string, unknown> = {}) => ({
  op: 'create' as const,
  entity: 'transaction' as const,
  data: {
    amountCents: 1000,
    description: 'Teste',
    date: '2026-11-05',
    accountId: account.id,
    categoryId,
    ...over,
  },
});

describe('extrair JSON da resposta da IA', () => {
  it('lê JSON puro, com texto em volta e cercado por crases', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Claro! Segue: {"a":{"b":"}"}} Espero ajudar.')).toEqual({ a: { b: '}' } });
    expect(extractJson('Aqui:\n```json\n{"a":2}\n```\nPronto')).toEqual({ a: 2 });
    expect(extractJson('{quebrado} e depois {"ok":true}')).toEqual({ ok: true });
    expect(() => extractJson('sem json')).toThrow('Não encontrei');
  });

  it('rejeita formato errado, campos desconhecidos e arquivos grandes', () => {
    expect(() => parseChangeset('{"format":"outro"}')).toThrow('formato esperado');
    const unknown = JSON.stringify({ ...changeset([]), extra: 1 });
    expect(() => parseChangeset(unknown)).toThrow('formato esperado');
    expect(() => parseChangeset('{"a":"' + 'x'.repeat(5 * 1024 * 1024) + '"}')).toThrow('5 MB');
    expect(parseChangeset(JSON.stringify(changeset([]))).operations).toEqual([]);
  });
});

describe('plano do change-set', () => {
  it('não grava nada ao planejar', async () => {
    await planChangeset(changeset([expense()]), database);
    expect(await database.transactions.count()).toBe(0);
  });

  it('completa campos e calcula a fatura do cartão', async () => {
    const plan = await planChangeset(
      changeset([
        expense({ accountId: null, cardId: card.id, date: '2026-11-03', status: 'pending' }),
      ]),
      database,
    );
    expect(plan.hasErrors).toBe(false);
    expect(plan.ops[0]!.after!.invoiceMonth).toBe('2026-12');
    expect(plan.ops[0]!.after!.competenceMonth).toBe('2026-11');
    expect(plan.ops[0]!.after!.source).toBe('ai');
    expect(summarizeCounts(plan.counts)).toBe('+1 criados, ~0 editados, −0 removidos');
  });

  it('resolve ids temporários, inclusive declarados depois', async () => {
    const plan = await planChangeset(
      changeset([
        expense({ categoryId: 'tmp:cat' }),
        { op: 'create', entity: 'category', tempId: 'tmp:cat', data: { name: 'Nova' } },
      ]),
      database,
    );
    expect(plan.hasErrors).toBe(false);
    expect(plan.ops[0]!.after!.categoryId).toBe(plan.ops[1]!.id);
    expect(plan.ops[1]!.id).not.toContain('tmp');
  });

  it('agrupa parcelas por um id temporário sem linha própria', async () => {
    const plan = await planChangeset(
      changeset([
        expense({ installmentGroupId: 'tmp:g', installmentNumber: 1, installmentTotal: 2 }),
        expense({ installmentGroupId: 'tmp:g', installmentNumber: 2, installmentTotal: 2 }),
      ]),
      database,
    );
    expect(plan.hasErrors).toBe(false);
    expect(plan.ops[0]!.after!.installmentGroupId).toBe(plan.ops[1]!.after!.installmentGroupId);
    expect(plan.ops[0]!.after!.installmentGroupId).not.toBe('tmp:g');
  });

  it.each([
    ['campo desconhecido', { bogus: 1 }, 'bogus'],
    ['conta e cartão juntos', { cardId: 'x' }, 'conta ou um cartão'],
    ['valor float', { amountCents: 1.5 }, 'amountCents'],
    ['data inválida', { date: '05/11/2026' }, 'date'],
  ])('aponta erro: %s', async (_name, over, text) => {
    const plan = await planChangeset(changeset([expense(over)]), database);
    expect(plan.hasErrors).toBe(true);
    expect(plan.ops[0]!.errors.join(' ')).toContain(text);
  });

  it('aponta referência inexistente, sem conta e categoria incompatível', async () => {
    const missing = await planChangeset(
      changeset([expense({ categoryId: 'nao-existe' })]),
      database,
    );
    expect(missing.ops[0]!.errors[0]).toContain('categoryId');
    const noTarget = await planChangeset(changeset([expense({ accountId: null })]), database);
    expect(noTarget.hasErrors).toBe(true);
    const wrongKind = await planChangeset(
      changeset([expense({ categoryId: incomeCategoryId })]),
      database,
    );
    expect(wrongKind.ops[0]!.errors[0]).toContain('não serve');
    const tag = await planChangeset(changeset([expense({ tagIds: ['t'] })]), database);
    expect(tag.ops[0]!.errors[0]).toContain('tagIds');
  });

  it('aponta id inexistente em update e delete', async () => {
    const plan = await planChangeset(
      changeset([
        { op: 'update', entity: 'transaction', id: 'x', patch: {} },
        { op: 'delete', entity: 'transaction', id: 'y' },
      ]),
      database,
    );
    expect(plan.ops.every((o) => o.errors.length === 1)).toBe(true);
  });

  it('mostra os campos alterados e recalcula a fatura ao mudar a data', async () => {
    const [id] = await createTransaction(
      {
        kind: 'expense',
        amountCents: 500,
        description: 'iFood',
        date: '2026-11-01',
        accountId: null,
        cardId: card.id,
        categoryId,
        tagIds: [],
        status: 'pending',
        notes: '',
        payerMemberId: null,
        splitRule: 'proportional',
        goalId: null,
        goalItemId: null,
      },
      database,
    );
    const plan = await planChangeset(
      changeset([
        {
          op: 'update',
          entity: 'transaction',
          id: id!,
          patch: { description: 'Delivery', date: '2026-11-05' },
        },
      ]),
      database,
    );
    expect(plan.ops[0]!.changed).toEqual(['description', 'date']);
    expect(plan.ops[0]!.after!.invoiceMonth).toBe('2026-12');
    expect(plan.ops[0]!.after!.competenceMonth).toBe('2026-11');
  });

  it('marca conflito em mês fechado e possível duplicata', async () => {
    await createTransaction(
      {
        kind: 'expense',
        amountCents: 1000,
        description: 'Teste',
        date: '2026-11-04',
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
      },
      database,
    );
    await closeMonth('2026-11', database);
    const plan = await planChangeset(changeset([expense()]), database);
    expect(plan.ops[0]!.conflicts[0]).toContain('fechado');
    expect(plan.ops[0]!.warnings[0]).toContain('duplicar');
    expect(plan.hasErrors).toBe(false);
  });

  it('marca conflito quando o registro mudou depois da exportação', async () => {
    const [id] = await createTransaction(
      {
        kind: 'expense',
        amountCents: 1,
        description: 'x',
        date: '2026-11-04',
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
      },
      database,
    );
    const old = '00000000-0000-7000-8000-000000000000';
    expect(exportTimeOf(old)).toBe(0);
    expect(exportTimeOf('nao-uuid')).toBeNull();
    expect(exportTimeOf(undefined)).toBeNull();
    const plan = await planChangeset(
      changeset(
        [
          { op: 'update', entity: 'transaction', id: id!, patch: { amountCents: 2 } },
          { op: 'delete', entity: 'transaction', id: id! },
        ],
        { basedOnExportId: old },
      ),
      database,
    );
    expect(plan.ops[0]!.conflicts[0]).toContain('depois da exportação');
    expect(plan.ops[1]!.conflicts[0]).toContain('depois da exportação');
  });
});

describe('aplicar e desfazer', () => {
  it('aplica só o selecionado, numa transação, e desfaz tudo', async () => {
    const [existing] = await createTransaction(
      {
        kind: 'expense',
        amountCents: 700,
        description: 'Antigo',
        date: '2026-10-04',
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
      },
      database,
    );
    const [other] = await createTransaction(
      {
        kind: 'expense',
        amountCents: 800,
        description: 'Outro',
        date: '2026-10-05',
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
      },
      database,
    );
    const plan = await planChangeset(
      changeset(
        [
          expense(),
          expense({ description: 'Ignorado', amountCents: 9 }),
          { op: 'update', entity: 'transaction', id: existing!, patch: { amountCents: 1 } },
          { op: 'delete', entity: 'transaction', id: other! },
        ],
        { summary: 'Teste' },
      ),
      database,
    );
    const log = await applyPlan(plan, new Set([0, 2, 3]), database);
    expect(log.summary).toBe('Teste');
    const live = async () => (await database.transactions.toArray()).filter((t) => !t.deletedAt);
    expect((await live()).map((t) => t.description).sort()).toEqual(['Antigo', 'Teste']);
    expect((await database.transactions.get(existing!))!.amountCents).toBe(1);

    await undoImport(log.id, database);
    expect((await live()).map((t) => t.description).sort()).toEqual(['Antigo', 'Outro']);
    expect((await database.transactions.get(existing!))!.amountCents).toBe(700);
    expect((await database.importLogs.get(log.id))!.undoneAt).not.toBeNull();
    await undoImport(log.id, database);
    await undoImport('inexistente', database);
    expect(await live()).toHaveLength(2);
  });

  it('recusa aplicar operação com erro e usa resumo automático', async () => {
    const bad = await planChangeset(changeset([expense({ bogus: 1 })]), database);
    await expect(applyPlan(bad, new Set([0]), database)).rejects.toThrow('tem erros');
    const good = await planChangeset(changeset([expense()]), database);
    const log = await applyPlan(good, new Set([0]), database);
    expect(log.summary).toContain('+1');
  });

  it('cria cada tipo de entidade com os padrões', async () => {
    const household = (await database.households.toCollection().first())!;
    const plan = await planChangeset(
      changeset([
        { op: 'create', entity: 'tag', data: { name: 'T' } },
        { op: 'create', entity: 'account', data: { name: 'A' } },
        {
          op: 'create',
          entity: 'card',
          tempId: 'tmp:c',
          data: { name: 'C', limitCents: 1, closingDay: 1, dueDay: 2 },
        },
        { op: 'create', entity: 'goal', tempId: 'tmp:g', data: { name: 'G', targetCents: 1 } },
        { op: 'create', entity: 'goalItem', data: { goalId: 'tmp:g', name: 'I', budgetCents: 1 } },
        {
          op: 'create',
          entity: 'goalMovement',
          data: {
            goalId: 'tmp:g',
            memberId: household.memberIds[0],
            kind: 'contribution',
            amountCents: 1,
            date: '2026-11-01',
          },
        },
        {
          op: 'create',
          entity: 'income',
          data: { memberId: household.memberIds[0], competenceMonth: '2026-11', amountCents: 1 },
        },
        { op: 'create', entity: 'budget', data: { categoryId, amountCents: 1 } },
        {
          op: 'create',
          entity: 'transfer',
          data: {
            fromAccountId: account.id,
            toCardId: 'tmp:c',
            kind: 'invoice_payment',
            invoiceMonth: '2026-11',
            amountCents: 1,
            date: '2026-11-01',
          },
        },
        { op: 'create', entity: 'rule', data: { match: { contains: 'x' }, set: { categoryId } } },
      ]),
      database,
    );
    expect(plan.ops.flatMap((o) => o.errors)).toEqual([]);
    await applyPlan(plan, new Set(plan.ops.map((o) => o.index)), database);
    expect(await database.goalItems.count()).toBe(1);
    expect((await database.transfers.toArray())[0]!.competenceMonth).toBe('2026-11');
  });
});

function snapshot(over: Partial<Data> = {}): Data {
  const [a, b]: Member[] = [
    { ...stamp('h'), id: 'A', name: 'Patrick', emoji: '', color: '' },
    { ...stamp('h'), id: 'B', name: 'Pessoa B', emoji: '', color: '' },
  ] as never;
  return {
    household: { ...stamp('h'), name: '', currency: 'BRL', memberIds: ['A', 'B'] },
    members: [a!, b!],
    accounts: [account],
    cards: [card],
    categories: [],
    tags: [],
    transactions: [],
    transfers: [],
    recurrences: [],
    budgets: [],
    goals: [],
    goalItems: [],
    goalMovements: [],
    incomes: [],
    closes: [],
    rules: [],
    settings: {} as Data['settings'],
    salaryPlans: [],
    splitMode: 'proportional',
    ...over,
  };
}

describe('pacote para IA', () => {
  it('é autoexplicativo, filtra por mês e gera os schemas', () => {
    const row = { ...stamp('h'), competenceMonth: '2026-11' } as unknown as Transaction;
    const out = { ...stamp('h'), competenceMonth: '2026-01' } as unknown as Transaction;
    const pkg = buildAiPackage(snapshot({ transactions: [row, out] }), {
      task: 'categorize',
      months: ['2026-11'],
    });
    expect(pkg.format).toBe('duo-ai-export');
    expect(pkg.data.transactions).toHaveLength(1);
    expect(pkg.instructions).toContain('duo-changeset');
    expect(pkg.instructions).toContain('categoryId null');
    expect(pkg.lookups.members[0]).toEqual({ id: 'A', name: 'Patrick', code: 'A' });
    expect(exportTimeOf(pkg.exportId)).not.toBeNull();
    expect(JSON.stringify(pkg.jsonSchema.changeset)).toContain('operations');
  });

  it('pergunta livre vai no topo das instruções, e todo atalho tem instrução', () => {
    const pkg = buildAiPackage(snapshot(), {
      task: 'free',
      months: [],
      question: 'Quanto gastei?',
    });
    expect(pkg.instructions.startsWith('PEDIDO DO USUÁRIO:\nQuanto gastei?')).toBe(true);
    for (const t of AI_TASKS.filter((x) => x.id !== 'free'))
      expect(t.instruction.length).toBeGreaterThan(10);
    expect(jsonSchemas().entities.transaction).toBeTruthy();
  });

  it('o exemplo das instruções passa no próprio validador', () => {
    const pkg = buildAiPackage(snapshot(), { task: 'free', months: [] });
    const example = pkg.instructions.slice(
      pkg.instructions.indexOf('{"format"'),
      pkg.instructions.indexOf('\n\nEntidades'),
    );
    expect(ChangesetSchema.safeParse(JSON.parse(example)).success).toBe(true);
  });
});

describe('backup', () => {
  const addRow = () =>
    createTransaction(
      {
        kind: 'expense',
        amountCents: 123,
        description: 'Pão',
        date: '2026-11-04',
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
      },
      database,
    );

  it('ida e volta: substituir traz tudo de volta', async () => {
    await addRow();
    await updateSettings({ jointBudgetCents: 77 }, database);
    const file = await backupToFile(false, database);
    expect(file.name).toMatch(/^duo-backup-\d{8}-\d{4}\.json$/);
    const parsed = await parseBackupFile(file);
    expect(parsed.errors).toEqual([]);
    expect(parsed.counts.transactions).toBe(1);

    await database.transactions.clear();
    await database.accounts.clear();
    await updateSettings({ jointBudgetCents: 0 }, database);
    await restoreBackup(parsed, 'replace', database);
    expect(await database.transactions.count()).toBe(1);
    expect(await database.accounts.count()).toBe(1);
    expect((await readSettings(database)).jointBudgetCents).toBe(77);
  });

  it('mesclar: vence o updatedAt mais recente', async () => {
    const [id] = await addRow();
    const parsed = await parseBackupFile(await backupToFile(false, database));
    const row = parsed.backup.tables.transactions![0] as Transaction;

    await database.transactions.update(id!, {
      description: 'Local mais novo',
      updatedAt: '2999-01-01T00:00:00.000Z',
    });
    let result = await restoreBackup(parsed, 'merge', database);
    expect(result.written).toBe(0);
    expect((await database.transactions.get(id!))!.description).toBe('Local mais novo');

    await database.transactions.update(id!, { updatedAt: '2000-01-01T00:00:00.000Z' });
    result = await restoreBackup(parsed, 'merge', database);
    expect(result.written).toBe(1);
    expect((await database.transactions.get(id!))!.description).toBe(row.description);
    const logs = await database.importLogs.toArray();
    expect(logs.some((l) => l.kind === 'backup')).toBe(true);
  });

  it('leva exclusões junto, para a mesclagem não ressuscitar nada', async () => {
    const [id] = await addRow();
    await database.transactions.update(id!, { deletedAt: new Date().toISOString() });
    const backup = await buildBackup(database);
    expect((backup.tables.transactions![0] as Transaction).deletedAt).not.toBeNull();
  });

  it('recusa arquivo que não é backup e registro inválido', async () => {
    await expect(parseBackupFile(new File(['{"format":"x"}'], 'a.json'))).rejects.toThrow(
      'não é um backup',
    );
    await expect(parseBackupFile(new File(['lixo'], 'a.json'))).rejects.toThrow('não é um backup');
    const backup = await buildBackup(database);
    backup.tables.accounts = [{ id: 'quebrada' }];
    const parsed = await parseBackupFile(new File([JSON.stringify(backup)], 'a.json'));
    expect(parsed.errors[0]).toContain('accounts');
    await expect(restoreBackup(parsed, 'replace', database)).rejects.toThrow('inválidos');
    expect(await database.accounts.count()).toBe(1);
  });

  it('zip inclui anexos', async () => {
    const [id] = await addRow();
    // fake-indexeddb cannot clone a jsdom Blob, so the stored row is handed back directly.
    const row = {
      id: 'f',
      householdId: 'h',
      transactionId: id!,
      blob: new Blob(['oi'], { type: 'image/webp' }),
      mime: 'image/webp',
      createdAt: 'x',
      updatedAt: 'x',
      deletedAt: null,
    };
    const spy = vi.spyOn(database.attachments, 'toArray').mockResolvedValue([row]);
    const file = await backupToFile(true, database);
    spy.mockRestore();
    expect(file.name.endsWith('.zip')).toBe(true);
    const parsed = await parseBackupFile(file);
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]!.mime).toBe('image/webp');
    await restoreBackup(parsed, 'merge', database);
    expect(await database.attachments.count()).toBe(1);
  });

  it('registra quando foi o último backup', async () => {
    await markBackupDone(database);
    expect((await readSettings(database)).lastBackupAt).not.toBeNull();
  });
});

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261103120000[-3:BRT]
<TRNAMT>-41,35
<FITID>A1
<MEMO>PADARIA S\xC3O JO\xC3O
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261105
<TRNAMT>8000.00
<FITID>A2
<NAME>SALARIO &amp; BONUS
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>invalida
<TRNAMT>-1.00
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const OFX_XML = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200"?>
<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261101</DTPOSTED><TRNAMT>-10.50</TRNAMT><FITID>X9</FITID><MEMO>Farmácia</MEMO></STMTTRN></BANKTRANLIST></OFX>`;

const latin1Bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

describe('OFX', () => {
  it('lê SGML 1.x com acentos em latin1 e vírgula decimal', () => {
    const rows = parseOfx(decodeStatement(latin1Bytes(OFX_SGML)));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      date: '2026-11-03',
      description: 'PADARIA SÃO JOÃO',
      amountCents: -4135,
      externalId: 'A1',
    });
    expect(rows[1]!.description).toBe('SALARIO & BONUS');
    expect(rows[1]!.amountCents).toBe(800000);
  });

  it('lê XML 2.x em UTF-8', () => {
    const rows = parseOfx(decodeStatement(new TextEncoder().encode(OFX_XML)));
    expect(rows).toEqual([
      { date: '2026-11-01', description: 'Farmácia', amountCents: -1050, externalId: 'X9' },
    ]);
  });

  it('cai para windows-1252 quando o arquivo não é UTF-8 válido', () => {
    expect(decodeStatement(latin1Bytes('<MEMO>Sem cabe\xE7alho'))).toContain('cabeçalho');
  });
});

describe('CSV', () => {
  it('detecta separador, adivinha colunas e lê valores brasileiros', async () => {
    const table = await parseCsv(
      '﻿Data;Histórico;Valor\n03/11/2026;Mercado;-41,35\n04/11/26;Salário;8.000,00\nruim;x;y\n',
    );
    const guess = guessMapping(table.columns);
    expect(guess).toEqual({ date: 'Data', description: 'Histórico', amount: 'Valor' });
    const { rows, skipped } = rowsFromCsv(table, {
      date: 'Data',
      description: 'Histórico',
      amount: 'Valor',
      invertSign: false,
    });
    expect(skipped).toBe(1);
    expect(rows[0]).toEqual({
      date: '2026-11-03',
      description: 'Mercado',
      amountCents: -4135,
      externalId: null,
    });
    expect(rows[1]!.amountCents).toBe(800000);
    const inverted = rowsFromCsv(table, {
      date: 'Data',
      description: 'Histórico',
      amount: 'Valor',
      invertSign: true,
    });
    expect(inverted.rows[0]!.amountCents).toBe(4135);
  });

  it('lê datas', () => {
    expect(parseDateText('2026-11-03T10:00')).toBe('2026-11-03');
    expect(parseDateText('3/1/2026')).toBe('2026-01-03');
    expect(parseDateText('hoje')).toBeNull();
  });
});

describe('revisão da importação', () => {
  const existing = (over: Partial<Transaction>) =>
    ({
      ...stamp('h'),
      accountId: 'a',
      cardId: null,
      amountCents: 1000,
      description: 'Mercado Extra',
      date: '2026-11-03',
      externalId: null,
      ...over,
    }) as Transaction;

  it('marca duplicata exata e possível, e aplica regras', () => {
    const rows = [
      { date: '2026-11-03', description: 'qualquer', amountCents: -5, externalId: 'F1' },
      { date: '2026-11-04', description: 'MERCADO extra sp', amountCents: -1000, externalId: null },
      { date: '2026-11-20', description: 'iFood', amountCents: -1000, externalId: null },
    ];
    const rule = {
      ...stamp('h'),
      match: { contains: 'ifood' },
      set: { categoryId: 'delivery', tagIds: ['t'], splitRule: 'equal' as const },
    };
    const review = buildReview(
      rows,
      { accountId: 'a', cardId: null },
      [existing({ externalId: 'F1', description: 'outro', amountCents: 5 }), existing({})],
      [rule],
    );
    expect(review.map((r) => r.state)).toEqual(['duplicate', 'maybe_duplicate', 'new']);
    expect(review.map((r) => r.selected)).toEqual([false, false, true]);
    expect(review[2]!.categoryId).toBe('delivery');
    expect(review[2]!.splitRule).toBe('equal');
    expect(review[1]!.duplicateOf).toBe('Mercado Extra');
  });

  it('o mesmo FITID em outra conta não é duplicata', () => {
    const rows = [{ date: '2026-11-03', description: 'x', amountCents: -5, externalId: 'F1' }];
    const review = buildReview(
      rows,
      { accountId: 'b', cardId: null },
      [existing({ externalId: 'F1' })],
      [],
    );
    expect(review[0]!.state).toBe('new');
  });

  it('importa só o marcado, e na fatura certa quando é cartão; dá para desfazer', async () => {
    const statement = [
      { date: '2026-11-03', description: 'Compra', amountCents: -1000, externalId: 'A' },
      { date: '2026-11-04', description: 'Estorno', amountCents: 200, externalId: 'B' },
      { date: '2026-11-05', description: 'Fora', amountCents: -1, externalId: 'C' },
    ];
    const review = buildReview(statement, { accountId: null, cardId: card.id }, [], []);
    review[2]!.selected = false;
    const log = await applyImport(
      review,
      { accountId: null, cardId: card.id, card },
      'ofx',
      database,
    );
    let rows = await database.transactions.toArray();
    expect(rows).toHaveLength(2);
    const compra = rows.find((r) => r.description === 'Compra')!;
    expect(compra.invoiceMonth).toBe('2026-12');
    expect(compra.status).toBe('pending');
    expect(compra.source).toBe('ofx');
    expect(rows.find((r) => r.description === 'Estorno')!.kind).toBe('income');
    await undoImport(log.id, database);
    rows = await database.transactions.toArray();
    expect(rows).toHaveLength(0);
  });
});

describe('saúde dos dados (6.7)', () => {
  const tx = (over: Partial<Transaction>): Transaction =>
    ({
      ...stamp('h'),
      kind: 'expense',
      amountCents: 1,
      description: 'x',
      date: '2026-11-01',
      competenceMonth: '2026-11',
      accountId: 'a',
      cardId: null,
      invoiceMonth: null,
      categoryId: null,
      tagIds: [],
      status: 'paid',
      installmentGroupId: null,
      installmentNumber: null,
      installmentTotal: null,
      goalId: null,
      goalItemId: null,
      splitRule: 'proportional',
      source: 'manual',
      payerMemberId: null,
      ...over,
    }) as Transaction;
  const kinds = (data: Data) => checkHealth(data, '2026-11-20').map((i) => i.kind);
  const income = (memberId: string) => ({
    ...stamp('h'),
    memberId,
    competenceMonth: '2026-11',
    type: 'salary' as const,
    amountCents: 1,
    countsForSplit: true,
  });

  it('dados corretos não geram avisos', () => {
    expect(
      kinds(snapshot({ transactions: [tx({})], incomes: [income('A'), income('B')] })),
    ).toEqual([]);
  });

  it('encontra cada problema', () => {
    const same = tx({});
    const issues = kinds(
      snapshot({
        incomes: [income('A'), income('B')],
        transactions: [
          same,
          { ...same },
          tx({ categoryId: 'nada' }),
          tx({ accountId: 'a', cardId: 'c' }),
          tx({ goalId: 'nada' }),
          tx({ status: 'pending' }),
          tx({ installmentGroupId: 'g', installmentTotal: 3, installmentNumber: 1 }),
        ],
      }),
    );
    for (const kind of [
      'duplicate_id',
      'missing_category',
      'account_and_card',
      'fund_without_goal',
      'overdue',
      'installment_count',
    ]) {
      expect(issues).toContain(kind);
    }
  });

  it('oferece corrigir fatura incoerente', () => {
    const [issue] = checkHealth(
      snapshot({
        incomes: [income('A'), income('B')],
        transactions: [
          tx({ accountId: null, cardId: card.id, invoiceMonth: '2020-01', date: '2026-11-01' }),
        ],
      }),
      '2026-11-20',
    );
    expect(issue!.kind).toBe('invoice_mismatch');
    expect(issue!.fix).toEqual({ invoiceMonth: '2026-11' });
  });

  it('gasto saindo da conta de um sonho sem estar ligado a ele', () => {
    const fund = { ...stamp('h'), accountId: 'a', name: 'Casamento' } as unknown as Goal;
    const issues = checkHealth(
      snapshot({ goals: [fund], incomes: [income('A'), income('B')], transactions: [tx({})] }),
      '2026-11-20',
    );
    expect(issues[0]!.message).toContain('Casamento');
  });

  it('mês com gasto sem renda e mês fechado com acerto pendente', () => {
    const accountA = { ...account, id: 'pa', ownerMemberId: 'A' };
    const close = {
      ...stamp('h'),
      id: '2026-11',
      month: '2026-11',
      pctByMember: { A: 0.5, B: 0.5 },
      incomeByMember: {},
      owedByMember: {},
      paidByMember: {},
      settlement: null,
      closedAt: 'x',
      reopenedAt: null,
    };
    const data = snapshot({
      accounts: [accountA],
      closes: [close],
      transactions: [tx({ accountId: 'pa', amountCents: 1000 })],
    });
    const issues = kinds(data);
    expect(issues.filter((k) => k === 'month_without_income')).toHaveLength(2);
    expect(issues).toContain('closed_with_pending_settlement');
  });
});
