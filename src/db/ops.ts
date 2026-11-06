import type { Table } from 'dexie';
import { v7 as uuidv7 } from 'uuid';
import { planInstallments, recurrenceDates } from '../domain/installments';
import { buildInvoice, invoiceMonthFor } from '../domain/invoices';
import { accountBalance } from '../domain/balances';
import { addMonths, lastDayOf, monthOf, today } from '../domain/months';
import { computeSettlement, memberAPct, type SplitContext } from '../domain/split';
import {
  ENTITY_SCHEMAS,
  type Account,
  type Budget,
  type Category,
  type CategoryRule,
  type CreditCard,
  type EntityTableName,
  type Goal,
  type GoalItem,
  type GoalMovement,
  type MemberIncome,
  type MonthClose,
  type Recurrence,
  type RecurrenceTemplate,
  type SplitRule,
  type Tag,
  type Transaction,
  type Transfer,
  type TransferKind,
} from '../schemas/entities';
import { type Settings, SETTINGS_ID } from '../schemas/settingsDefaults';
import { db, readSettings, type DuoDatabase } from './database';
import { ADJUSTMENT_CATEGORY_NAME, SEED_CATEGORIES } from './seedCategories';

export const newId = (): string => uuidv7();
const nowIso = (): string => new Date().toISOString();

type Row = {
  id: string;
  householdId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

const tableOf = (database: DuoDatabase, name: EntityTableName) =>
  database.table(name) as unknown as Table<Row, string>;

async function householdId(database: DuoDatabase): Promise<string> {
  const household = await database.households.toCollection().first();
  if (!household) throw new Error('Household not created yet');
  return household.id;
}

export function stamp(hid: string) {
  const at = nowIso();
  return { id: newId(), householdId: hid, createdAt: at, updatedAt: at, deletedAt: null };
}

async function markChanged(database: DuoDatabase): Promise<void> {
  const current = await readSettings(database);
  await database.settings.put({ ...current, lastChangeAt: nowIso() });
}

let bootstrapping: Promise<void> | null = null;

/** Creates the household and the category seed on first launch. Safe to call repeatedly. */
export function bootstrap(database: DuoDatabase = db): Promise<void> {
  bootstrapping ??= runBootstrap(database).finally(() => {
    bootstrapping = null;
  });
  return bootstrapping;
}

async function runBootstrap(database: DuoDatabase): Promise<void> {
  await database.transaction(
    'rw',
    [database.households, database.members, database.categories],
    async () => {
      if ((await database.households.count()) > 0) return;
      const hid = newId();
      const base = () => ({ ...stamp(hid) });
      const a = { ...base(), name: 'Patrick', emoji: '🙂', color: '#3A6EA5' };
      const b = { ...base(), name: 'Pessoa B', emoji: '😊', color: '#D9774B' };
      await database.members.bulkPut([a, b]);
      await database.households.put({
        ...stamp(hid),
        id: hid,
        name: 'Nossa casa',
        currency: 'BRL',
        memberIds: [a.id, b.id],
      });
      const rows: Category[] = SEED_CATEGORIES.map((c) => ({
        ...base(),
        name: c.name,
        kind: c.kind,
        parentId: null,
        icon: c.icon,
        color: c.color,
        nature: c.nature,
        defaultSplitRule: c.split ?? 'proportional',
        archived: false,
        system: false,
      }));
      rows.push({
        ...base(),
        name: ADJUSTMENT_CATEGORY_NAME,
        kind: 'expense',
        parentId: null,
        icon: 'dots',
        color: '#8E8A86',
        nature: 'lifestyle',
        defaultSplitRule: 'proportional',
        archived: false,
        system: true,
      });
      await database.categories.bulkPut(rows);
    },
  );
}

export async function updateSettings(
  patch: Partial<Omit<Settings, 'id' | 'updatedAt'>>,
  database: DuoDatabase = db,
): Promise<Settings> {
  return database.transaction('rw', database.settings, async () => {
    const next = {
      ...(await readSettings(database)),
      ...patch,
      id: SETTINGS_ID,
      updatedAt: nowIso(),
    };
    await database.settings.put(next as Settings);
    return next as Settings;
  });
}

/** Validates and writes one row, stamping it. Generic because most entities need nothing more. */
export async function upsert<T extends Row>(
  table: EntityTableName,
  row: Omit<T, keyof Row> & Partial<Row>,
  database: DuoDatabase = db,
): Promise<T> {
  const hid = row.householdId ?? (await householdId(database));
  const at = nowIso();
  const candidate = {
    id: row.id ?? newId(),
    createdAt: row.createdAt ?? at,
    deletedAt: row.deletedAt ?? null,
    ...row,
    householdId: hid,
    updatedAt: at,
  };
  const parsed = ENTITY_SCHEMAS[table].parse(candidate) as unknown as T;
  await database.transaction('rw', tableOf(database, table), database.settings, async () => {
    await tableOf(database, table).put(parsed);
    await markChanged(database);
  });
  return parsed;
}

export async function softDelete(table: EntityTableName, id: string, database: DuoDatabase = db) {
  const at = nowIso();
  await tableOf(database, table).update(id, { deletedAt: at, updatedAt: at });
  await markChanged(database);
}

export async function restore(table: EntityTableName, ids: string[], database: DuoDatabase = db) {
  const at = nowIso();
  await database.transaction('rw', tableOf(database, table), async () => {
    for (const id of ids)
      await tableOf(database, table).update(id, { deletedAt: null, updatedAt: at });
  });
  await markChanged(database);
}

export type RepeatPlan =
  | { mode: 'none' }
  | { mode: 'installments'; count: number }
  | { mode: 'recurring'; frequency: Recurrence['frequency']; endDate: string | null };

export interface TransactionDraft {
  kind: Transaction['kind'];
  amountCents: number;
  description: string;
  date: string;
  accountId: string | null;
  cardId: string | null;
  categoryId: string | null;
  tagIds: string[];
  status: Transaction['status'];
  notes: string;
  payerMemberId: string | null;
  splitRule: SplitRule;
  goalId: string | null;
  goalItemId: string | null;
  source?: Transaction['source'];
  externalId?: string | null;
  competenceMonth?: string;
  invoiceMonth?: string | null;
  repeat?: RepeatPlan;
}

function toRow(draft: TransactionDraft, hid: string, over: Partial<Transaction> = {}): Transaction {
  return ENTITY_SCHEMAS.transactions.parse({
    ...stamp(hid),
    kind: draft.kind,
    amountCents: draft.amountCents,
    description: draft.description.trim(),
    date: draft.date,
    competenceMonth: draft.competenceMonth ?? monthOf(draft.date),
    accountId: draft.accountId,
    cardId: draft.cardId,
    invoiceMonth: draft.invoiceMonth ?? null,
    categoryId: draft.categoryId,
    tagIds: draft.tagIds,
    // Card rows stay pending until the invoice is paid (spec 5.3).
    status: draft.cardId ? 'pending' : draft.status,
    recurrenceId: null,
    installmentGroupId: null,
    installmentNumber: null,
    installmentTotal: null,
    payerMemberId: draft.payerMemberId,
    splitRule: draft.splitRule,
    goalId: draft.goalId,
    goalItemId: draft.goalItemId,
    notes: draft.notes,
    attachmentIds: [],
    source: draft.source ?? 'manual',
    externalId: draft.externalId ?? null,
    ...over,
  });
}

const HORIZON_MONTHS = 12;

/** Derived, not random: two phones topping up the same bill must produce the same row, not a duplicate. */
const occurrenceId = (recurrenceId: string, date: string) => `${recurrenceId}:${date}`;

function horizon(now: string): string {
  return lastDayOf(addMonths(monthOf(now), HORIZON_MONTHS));
}

/** Creates the row, or the set of rows when the draft repeats. Returns their ids. */
export async function createTransaction(
  draft: TransactionDraft,
  database: DuoDatabase = db,
  now: string = today(),
): Promise<string[]> {
  if (draft.amountCents <= 0) throw new Error('Informe um valor');
  const hid = await householdId(database);
  const card = draft.cardId ? await database.cards.get(draft.cardId) : null;
  const repeat = draft.repeat ?? { mode: 'none' };
  const rows: Transaction[] = [];
  let recurrence: Recurrence | null = null;

  if (repeat.mode === 'installments' && repeat.count > 1) {
    const groupId = newId();
    for (const p of planInstallments(draft.amountCents, repeat.count, draft.date, card ?? null)) {
      rows.push(
        toRow(
          { ...draft, amountCents: p.amountCents, date: p.date, invoiceMonth: p.invoiceMonth },
          hid,
          {
            competenceMonth: p.competenceMonth,
            installmentGroupId: groupId,
            installmentNumber: p.number,
            installmentTotal: p.total,
            // Only the first installment can already have left the account.
            status: draft.cardId || p.number > 1 ? 'pending' : draft.status,
          },
        ),
      );
    }
  } else if (repeat.mode === 'recurring') {
    const until = horizon(now);
    const template: RecurrenceTemplate = {
      kind: draft.kind,
      amountCents: draft.amountCents,
      description: draft.description.trim(),
      accountId: draft.accountId,
      cardId: draft.cardId,
      categoryId: draft.categoryId,
      tagIds: draft.tagIds,
      payerMemberId: draft.payerMemberId,
      splitRule: draft.splitRule,
      notes: draft.notes,
    };
    recurrence = ENTITY_SCHEMAS.recurrences.parse({
      ...stamp(hid),
      template,
      frequency: repeat.frequency,
      interval: 1,
      startDate: draft.date,
      endDate: repeat.endDate,
      generatedUntil: until,
    });
    const dates = recurrenceDates(recurrence, null, until);
    dates.forEach((date, i) => {
      rows.push(
        toRow(
          {
            ...draft,
            date,
            invoiceMonth: card ? invoiceMonthFor(date, card) : null,
            source: 'recurrence',
          },
          hid,
          {
            id: occurrenceId(recurrence!.id, date),
            recurrenceId: recurrence!.id,
            status: i === 0 ? draft.status : 'pending',
          },
        ),
      );
    });
  } else {
    rows.push(
      toRow({ ...draft, invoiceMonth: card ? invoiceMonthFor(draft.date, card) : null }, hid),
    );
  }

  await database.transaction(
    'rw',
    [database.transactions, database.recurrences, database.settings],
    async () => {
      if (recurrence) await database.recurrences.put(recurrence);
      await database.transactions.bulkPut(rows);
      await markChanged(database);
    },
  );
  return rows.map((r) => r.id);
}

export type EditScope = 'one' | 'forward' | 'all';

function siblingsOf(all: Transaction[], row: Transaction, scope: EditScope): Transaction[] {
  if (scope === 'one') return [row];
  const group = all.filter((t) =>
    row.installmentGroupId
      ? t.installmentGroupId === row.installmentGroupId
      : row.recurrenceId
        ? t.recurrenceId === row.recurrenceId
        : t.id === row.id,
  );
  if (scope === 'all') return group;
  return group.filter((t) =>
    row.installmentNumber !== null
      ? (t.installmentNumber ?? 0) >= row.installmentNumber
      : t.date >= row.date,
  );
}

const CASCADING: (keyof Transaction)[] = [
  'amountCents',
  'description',
  'categoryId',
  'tagIds',
  'accountId',
  'cardId',
  'payerMemberId',
  'splitRule',
  'notes',
  'goalId',
  'goalItemId',
];

/** Fields like the date only make sense on the row being edited; the rest cascade with the scope. */
export async function updateTransaction(
  id: string,
  patch: Partial<Transaction>,
  scope: EditScope = 'one',
  database: DuoDatabase = db,
): Promise<void> {
  await database.transaction(
    'rw',
    [database.transactions, database.recurrences, database.cards, database.settings],
    async () => {
      const row = await database.transactions.get(id);
      if (!row) throw new Error('Lançamento não encontrado');
      const live = (await database.transactions.toArray()).filter((t) => !t.deletedAt);
      const at = nowIso();
      const cascade = Object.fromEntries(
        Object.entries(patch).filter(([k]) => CASCADING.includes(k as keyof Transaction)),
      ) as Partial<Transaction>;

      for (const target of siblingsOf(live, row, scope)) {
        const change = target.id === id ? patch : cascade;
        const next = { ...target, ...change, updatedAt: at };
        if (next.cardId) {
          const card = await database.cards.get(next.cardId);
          // Installments keep the invoice they were planned into unless the card itself changed.
          if (card && (change.date || change.cardId) && !next.installmentGroupId) {
            next.invoiceMonth = invoiceMonthFor(next.date, card);
          }
          if (card && change.cardId && next.installmentGroupId) {
            const first = invoiceMonthFor(next.date, card);
            next.invoiceMonth = addMonths(first, (next.installmentNumber ?? 1) - 1);
          }
        } else {
          next.invoiceMonth = null;
          if (change.date && !next.installmentGroupId) next.competenceMonth = monthOf(next.date);
        }
        if (next.cardId && change.date && !next.installmentGroupId) {
          next.competenceMonth = monthOf(next.date);
        }
        await database.transactions.put(ENTITY_SCHEMAS.transactions.parse(next));
      }

      if (row.recurrenceId && scope !== 'one') {
        const recurrence = await database.recurrences.get(row.recurrenceId);
        if (recurrence) {
          const template = { ...recurrence.template };
          for (const [k, v] of Object.entries(cascade)) {
            if (k in template) (template as Record<string, unknown>)[k] = v;
          }
          await database.recurrences.put({ ...recurrence, template, updatedAt: at });
        }
      }
      await markChanged(database);
    },
  );
}

/** Returns what was deleted so the toast can offer "Desfazer". */
export async function deleteTransaction(
  id: string,
  scope: EditScope = 'one',
  database: DuoDatabase = db,
): Promise<{ ids: string[]; recurrence: Recurrence | null }> {
  return database.transaction(
    'rw',
    [database.transactions, database.recurrences, database.settings],
    async () => {
      const row = await database.transactions.get(id);
      if (!row) return { ids: [], recurrence: null };
      const live = (await database.transactions.toArray()).filter((t) => !t.deletedAt);
      const targets = siblingsOf(live, row, scope);
      const at = nowIso();
      await Promise.all(
        targets.map((t) => database.transactions.update(t.id, { deletedAt: at, updatedAt: at })),
      );
      let previous: Recurrence | null = null;
      if (row.recurrenceId && scope !== 'one') {
        const recurrence = await database.recurrences.get(row.recurrenceId);
        if (recurrence) {
          previous = recurrence;
          // Otherwise the next launch would generate the deleted occurrences all over again.
          await database.recurrences.put(
            scope === 'all'
              ? { ...recurrence, deletedAt: at, updatedAt: at }
              : { ...recurrence, endDate: earlierDay(row.date), updatedAt: at },
          );
        }
      }
      await markChanged(database);
      return { ids: targets.map((t) => t.id), recurrence: previous };
    },
  );
}

function earlierDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function undoDeleteTransaction(
  ids: string[],
  recurrence: Recurrence | null,
  database: DuoDatabase = db,
): Promise<void> {
  await restore('transactions', ids, database);
  if (recurrence) await database.recurrences.put(recurrence);
}

export async function toggleStatus(id: string, database: DuoDatabase = db): Promise<void> {
  const row = await database.transactions.get(id);
  if (!row || row.cardId) return;
  await database.transactions.update(id, {
    status: row.status === 'paid' ? 'pending' : 'paid',
    updatedAt: nowIso(),
  });
  await markChanged(database);
}

/** Tops up generated occurrences to the horizon; existing rows, edited or not, stay untouched. */
export async function syncRecurrences(
  database: DuoDatabase = db,
  now: string = today(),
): Promise<number> {
  const until = horizon(now);
  const recurrences = (await database.recurrences.toArray()).filter(
    (r) => !r.deletedAt && r.generatedUntil < until,
  );
  let created = 0;
  for (const recurrence of recurrences) {
    const card = recurrence.template.cardId
      ? await database.cards.get(recurrence.template.cardId)
      : null;
    const dates = recurrenceDates(recurrence, recurrence.generatedUntil, until);
    const rows = dates.map((date) =>
      toRow(
        {
          ...recurrence.template,
          date,
          status: 'pending',
          goalId: null,
          goalItemId: null,
          source: 'recurrence',
          invoiceMonth: card ? invoiceMonthFor(date, card) : null,
        },
        recurrence.householdId,
        { id: occurrenceId(recurrence.id, date), recurrenceId: recurrence.id },
      ),
    );
    await database.transaction('rw', database.transactions, database.recurrences, async () => {
      await database.transactions.bulkPut(rows);
      await database.recurrences.put({ ...recurrence, generatedUntil: until, updatedAt: nowIso() });
    });
    created += rows.length;
  }
  return created;
}

export interface TransferDraft {
  kind: TransferKind;
  fromAccountId: string;
  toAccountId: string | null;
  toCardId?: string | null;
  invoiceMonth?: string | null;
  amountCents: number;
  date: string;
  competenceMonth?: string;
  status?: Transfer['status'];
  notes?: string;
}

export async function createTransfer(
  draft: TransferDraft,
  database: DuoDatabase = db,
): Promise<Transfer> {
  if (draft.amountCents <= 0) throw new Error('Informe um valor');
  if (draft.fromAccountId === draft.toAccountId) throw new Error('Escolha contas diferentes');
  return upsert<Transfer>(
    'transfers',
    {
      kind: draft.kind,
      fromAccountId: draft.fromAccountId,
      toAccountId: draft.toAccountId,
      toCardId: draft.toCardId ?? null,
      invoiceMonth: draft.invoiceMonth ?? null,
      amountCents: draft.amountCents,
      date: draft.date,
      competenceMonth: draft.competenceMonth ?? monthOf(draft.date),
      status: draft.status ?? 'paid',
      notes: draft.notes ?? '',
    },
    database,
  );
}

/** Removing an invoice payment reopens the invoice, so its rows must follow. */
export async function deleteTransfer(id: string, database: DuoDatabase = db): Promise<void> {
  await softDelete('transfers', id, database);
  await reconcileTransfer(id, database);
}

export async function restoreTransfer(id: string, database: DuoDatabase = db): Promise<void> {
  await restore('transfers', [id], database);
  await reconcileTransfer(id, database);
}

export async function reconcileTransfer(id: string, database: DuoDatabase = db): Promise<void> {
  const row = await database.transfers.get(id);
  if (row?.kind !== 'invoice_payment' || !row.toCardId || !row.invoiceMonth) return;
  const card = await database.cards.get(row.toCardId);
  if (card) await reconcileInvoice(card, row.invoiceMonth, database);
}

/** Records the payment and, once the invoice is covered, settles its rows (spec 5.3). */
export async function payInvoice(
  card: CreditCard,
  month: string,
  amountCents: number,
  fromAccountId: string,
  date: string,
  database: DuoDatabase = db,
): Promise<void> {
  await createTransfer(
    {
      kind: 'invoice_payment',
      fromAccountId,
      toAccountId: null,
      toCardId: card.id,
      invoiceMonth: month,
      amountCents,
      date,
    },
    database,
  );
  await reconcileInvoice(card, month, database);
}

export async function reconcileInvoice(
  card: CreditCard,
  month: string,
  database: DuoDatabase = db,
): Promise<void> {
  const transactions = (
    await database.transactions.where('invoiceMonth').equals(month).toArray()
  ).filter((t) => !t.deletedAt && t.cardId === card.id);
  const transfers = (await database.transfers.where('toCardId').equals(card.id).toArray()).filter(
    (t) => !t.deletedAt,
  );
  const invoice = buildInvoice(card, month, transactions, transfers, today());
  const status = invoice.status === 'paid' ? 'paid' : 'pending';
  const at = nowIso();
  await database.transaction('rw', database.transactions, async () => {
    await Promise.all(
      invoice.items
        .filter((t) => t.status !== status)
        .map((t) => database.transactions.update(t.id, { status, updatedAt: at })),
    );
  });
}

/** Creates the difference as an adjustment row, as Mobills does (spec 2.3). */
export async function adjustBalance(
  account: Account,
  targetCents: number,
  database: DuoDatabase = db,
  now: string = today(),
): Promise<void> {
  const transactions = (
    await database.transactions.where('accountId').equals(account.id).toArray()
  ).filter((t) => !t.deletedAt);
  const transfers = (await database.transfers.toArray()).filter((t) => !t.deletedAt);
  const delta = targetCents - accountBalance(account, transactions, transfers);
  if (delta === 0) return;
  const categories = await database.categories.toArray();
  const category = categories.find((c) => c.system && c.name === ADJUSTMENT_CATEGORY_NAME);
  await createTransaction(
    {
      kind: delta > 0 ? 'income' : 'expense',
      amountCents: Math.abs(delta),
      description: 'Ajuste de saldo',
      date: now,
      accountId: account.id,
      cardId: null,
      categoryId: category?.id ?? null,
      tagIds: [],
      status: 'paid',
      notes: '',
      payerMemberId: null,
      splitRule: 'proportional',
      goalId: null,
      goalItemId: null,
      source: 'adjustment',
    },
    database,
    now,
  );
}

export async function setBudget(
  categoryId: string,
  month: string | null,
  amountCents: number,
  database: DuoDatabase = db,
): Promise<void> {
  const existing = (await database.budgets.where('categoryId').equals(categoryId).toArray()).find(
    (b) => b.month === month && !b.deletedAt,
  );
  await upsert<Budget>(
    'budgets',
    existing ? { ...existing, amountCents } : { categoryId, month, amountCents },
    database,
  );
}

export async function loadSplitContext(database: DuoDatabase = db): Promise<SplitContext> {
  const live = <T extends { deletedAt: string | null }>(rows: T[]) =>
    rows.filter((r) => !r.deletedAt);
  const household = await database.households.toCollection().first();
  if (!household) throw new Error('Household not created yet');
  return {
    household,
    accounts: live(await database.accounts.toArray()),
    cards: live(await database.cards.toArray()),
    goals: live(await database.goals.toArray()),
    incomes: live(await database.incomes.toArray()),
    closes: live(await database.closes.toArray()),
    transactions: live(await database.transactions.toArray()),
    transfers: live(await database.transfers.toArray()),
  };
}

/** Freezes the month: from here on, changing an income no longer alters this split (5.5.5). */
export async function closeMonth(month: string, database: DuoDatabase = db): Promise<MonthClose> {
  const ctx = await loadSplitContext(database);
  const open = { ...ctx, closes: ctx.closes.filter((c) => c.month !== month) };
  const result = computeSettlement(open, month);
  const pctA = memberAPct(open, month);
  const [a, b] = ctx.household.memberIds;
  const existing = ctx.closes.find((c) => c.month === month);
  return upsert<MonthClose>(
    'closes',
    {
      ...(existing ?? {}),
      id: month,
      month,
      pctByMember: { [a]: pctA, [b]: 1 - pctA },
      incomeByMember: { [a]: result.incomeA, [b]: result.incomeB },
      owedByMember: { [a]: result.owedA, [b]: result.owedB },
      paidByMember: { [a]: result.paidA, [b]: result.paidB },
      settlement: result.transfer,
      closedAt: nowIso(),
      reopenedAt: null,
    },
    database,
  );
}

export async function reopenMonth(month: string, database: DuoDatabase = db): Promise<void> {
  const row = await database.closes.get(month);
  if (row) await upsert<MonthClose>('closes', { ...row, reopenedAt: nowIso() }, database);
}

/** The shared account the whole app revolves around. Created on demand for older installs. */
export async function ensureJointAccount(database: DuoDatabase = db): Promise<Account> {
  const accounts = (await database.accounts.toArray()).filter((a) => !a.deletedAt && !a.archived);
  const existing = accounts.find((a) => a.type === 'joint');
  if (existing) return existing;
  return upsert<Account>(
    'accounts',
    {
      name: 'Conta conjunta',
      type: 'joint',
      ownerMemberId: null,
      initialBalanceCents: 0,
      color: '#6E2F6B',
      icon: 'house',
      includeInTotal: true,
      archived: false,
    },
    database,
  );
}

/** Deposits need a source to say whose money it was, even if nobody tracks that personal account. */
export async function ensurePersonalAccount(
  memberId: string,
  database: DuoDatabase = db,
): Promise<Account> {
  const accounts = (await database.accounts.toArray()).filter((a) => !a.deletedAt && !a.archived);
  const existing = accounts.find((a) => a.ownerMemberId === memberId && a.type !== 'joint');
  if (existing) return existing;
  const member = await database.members.get(memberId);
  return upsert<Account>(
    'accounts',
    {
      name: `Conta de ${member?.name ?? 'pessoa'}`,
      type: 'checking',
      ownerMemberId: memberId,
      initialBalanceCents: 0,
      color: '#3A6EA5',
      icon: 'bank',
      includeInTotal: false,
      archived: false,
    },
    database,
  );
}

/** "Transferi": moves a member's part into the joint account for the month. */
export async function recordJointDeposit(
  memberId: string,
  amountCents: number,
  month: string,
  date: string,
  database: DuoDatabase = db,
): Promise<Transfer> {
  const joint = await ensureJointAccount(database);
  const own = await ensurePersonalAccount(memberId, database);
  return createTransfer(
    {
      kind: 'joint_deposit',
      fromAccountId: own.id,
      toAccountId: joint.id,
      amountCents,
      date,
      competenceMonth: month,
    },
    database,
  );
}

/** Fixed id: both phones of a couple add this to older installs and must end up with the same row. */
export const COUPLE_BILLS_CATEGORY_ID = 'cat-contas-do-casal';

export async function ensureCoupleCategory(database: DuoDatabase = db): Promise<void> {
  const rows = await database.categories.toArray();
  if (rows.some((c) => c.name === 'Contas do casal')) return;
  const household = await database.households.toCollection().first();
  if (!household) return;
  await database.categories.put({
    ...stamp(household.id),
    id: COUPLE_BILLS_CATEGORY_ID,
    name: 'Contas do casal',
    kind: 'expense',
    parentId: null,
    icon: 'receipt',
    color: '#6E2F6B',
    nature: 'essential',
    defaultSplitRule: 'proportional',
    archived: false,
    system: false,
  });
}

export function rememberCategory(settings: Settings, categoryId: string): string[] {
  return [categoryId, ...settings.recentCategoryIds.filter((id) => id !== categoryId)].slice(0, 8);
}

export type {
  Account,
  Budget,
  Category,
  CategoryRule,
  CreditCard,
  Goal,
  GoalItem,
  GoalMovement,
  MemberIncome,
  Tag,
  Transaction,
  Transfer,
};
