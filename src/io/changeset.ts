import type { Table } from 'dexie';
import { z } from 'zod';
import { db, type DuoDatabase } from '../db/database';
import { newId, stamp } from '../db/ops';
import { invoiceMonthFor } from '../domain/invoices';
import { monthOf } from '../domain/months';
import { isMonthClosed } from '../domain/split';
import { similarDescriptions } from '../domain/summaries';
import {
  ENTITY_SCHEMAS,
  type ChangeOp,
  type EntityTableName,
  type ImportLog,
} from '../schemas/entities';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_OPERATIONS = 5000;

const ENTITY_TO_TABLE = {
  transaction: 'transactions',
  transfer: 'transfers',
  account: 'accounts',
  card: 'cards',
  category: 'categories',
  tag: 'tags',
  budget: 'budgets',
  goal: 'goals',
  goalItem: 'goalItems',
  goalMovement: 'goalMovements',
  income: 'incomes',
  rule: 'rules',
} as const satisfies Record<string, EntityTableName>;

export type EntityName = keyof typeof ENTITY_TO_TABLE;
const EntityNameSchema = z.enum(Object.keys(ENTITY_TO_TABLE) as [EntityName, ...EntityName[]]);

const reason = z.string().optional();

const OperationSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('create'),
    entity: EntityNameSchema,
    tempId: z.string().optional(),
    data: z.record(z.string(), z.unknown()),
    reason,
  }),
  z.strictObject({
    op: z.literal('update'),
    entity: EntityNameSchema,
    id: z.string(),
    patch: z.record(z.string(), z.unknown()),
    reason,
  }),
  z.strictObject({ op: z.literal('delete'), entity: EntityNameSchema, id: z.string(), reason }),
]);
export type Operation = z.infer<typeof OperationSchema>;

export const ChangesetSchema = z.strictObject({
  format: z.literal('duo-changeset'),
  schemaVersion: z.literal(1),
  basedOnExportId: z.string().optional(),
  summary: z.string().optional(),
  questions: z.array(z.string()).optional(),
  operations: z.array(OperationSchema).max(MAX_OPERATIONS),
});
export type Changeset = z.infer<typeof ChangesetSchema>;

/**
 * AIs usually wrap the JSON in prose or a code fence, and pasting is the common path on a phone.
 * Finds the first balanced object that parses.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = fenced ? [fenced[1]!, text] : [text];
  for (const candidate of candidates) {
    for (
      let start = candidate.indexOf('{');
      start >= 0;
      start = candidate.indexOf('{', start + 1)
    ) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < candidate.length; i++) {
        const c = candidate[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === '"') inString = false;
        } else if (c === '"') inString = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error('Não encontrei um JSON válido nesse texto.');
}

export function parseChangeset(text: string): Changeset {
  if (new Blob([text]).size > MAX_BYTES) throw new Error('Arquivo maior que 5 MB.');
  const result = ChangesetSchema.safeParse(extractJson(text));
  if (!result.success) {
    const lines = result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || 'arquivo'}: ${i.message}`);
    throw new Error(`O arquivo não está no formato esperado.\n${lines.join('\n')}`);
  }
  return result.data;
}

export interface PlannedOp {
  index: number;
  op: Operation['op'];
  entity: EntityName;
  table: EntityTableName;
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed: string[];
  reason: string;
  errors: string[];
  conflicts: string[];
  warnings: string[];
}

export interface Plan {
  changeset: Changeset;
  ops: PlannedOp[];
  counts: { create: number; update: number; delete: number };
  hasErrors: boolean;
}

/** Fields a person or an AI should not have to spell out. */
function defaultsFor(entity: EntityName): Record<string, unknown> {
  switch (entity) {
    case 'transaction':
      return {
        kind: 'expense',
        description: '',
        accountId: null,
        cardId: null,
        invoiceMonth: null,
        categoryId: null,
        tagIds: [],
        status: 'paid',
        recurrenceId: null,
        installmentGroupId: null,
        installmentNumber: null,
        installmentTotal: null,
        payerMemberId: null,
        splitRule: 'proportional',
        goalId: null,
        goalItemId: null,
        notes: '',
        attachmentIds: [],
        source: 'ai',
        externalId: null,
      };
    case 'transfer':
      return {
        kind: 'transfer',
        toAccountId: null,
        toCardId: null,
        invoiceMonth: null,
        status: 'paid',
        notes: '',
      };
    case 'account':
      return {
        type: 'checking',
        ownerMemberId: null,
        initialBalanceCents: 0,
        color: '#6E2F6B',
        icon: 'bank',
        includeInTotal: true,
        archived: false,
      };
    case 'card':
      return {
        brand: '',
        paymentAccountId: null,
        ownerMemberId: null,
        color: '#6E2F6B',
        archived: false,
      };
    case 'category':
      return {
        kind: 'expense',
        parentId: null,
        icon: 'star',
        color: '#6250d6',
        nature: 'lifestyle',
        defaultSplitRule: 'proportional',
        archived: false,
        system: false,
      };
    case 'tag':
      return { color: '#6E2F6B' };
    case 'budget':
      return { month: null };
    case 'goal':
      return {
        emoji: '✨',
        coverAssetId: null,
        type: 'saving',
        targetCents: null,
        targetDate: null,
        priority: 3,
        splitRule: 'proportional',
        accountId: null,
        reportedBalanceCents: null,
        status: 'active',
      };
    case 'goalItem':
      return { vendor: '', dueDate: null };
    case 'income':
      return { type: 'salary', countsForSplit: true };
    default:
      return {};
  }
}

function withDerivedFields(
  entity: EntityName,
  row: Record<string, unknown>,
  cards: Map<string, Record<string, unknown>>,
) {
  const next = { ...row };
  const date = typeof next.date === 'string' ? next.date : null;
  if (
    (entity === 'transaction' || entity === 'transfer' || entity === 'goalMovement') &&
    date &&
    !next.competenceMonth
  ) {
    next.competenceMonth = monthOf(date);
  }
  // The AI may leave the invoice for the app: rule 5.2 lives here, not in a prompt.
  if (entity === 'transaction' && next.cardId && !next.invoiceMonth && date) {
    const card = cards.get(String(next.cardId));
    if (card) {
      next.invoiceMonth = invoiceMonthFor(date, {
        closingDay: Number(card.closingDay),
        dueDay: Number(card.dueDay),
      });
    }
  }
  return next;
}

function resolveTemps(value: unknown, temps: Map<string, string>): unknown {
  if (typeof value === 'string') return temps.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => resolveTemps(v, temps));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTemps(v, temps)]));
  }
  return value;
}

/** UUID v7 carries its creation time, so the id alone says when the export was made. */
export function exportTimeOf(exportId: string | undefined): number | null {
  if (!exportId) return null;
  const hex = exportId.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex) || hex[12] !== '7') return null;
  return parseInt(hex.slice(0, 12), 16);
}

const REFERENCES: [string, EntityTableName][] = [
  ['accountId', 'accounts'],
  ['cardId', 'cards'],
  ['categoryId', 'categories'],
  ['goalId', 'goals'],
  ['goalItemId', 'goalItems'],
  ['fromAccountId', 'accounts'],
  ['toAccountId', 'accounts'],
  ['toCardId', 'cards'],
  ['paymentAccountId', 'accounts'],
];

const issueText = (error: z.ZodError) =>
  error.issues.slice(0, 4).map((i) => `${i.path.join('.') || 'registro'}: ${i.message}`);

/** Validates everything and touches nothing. The preview is built from this. */
export async function planChangeset(
  changeset: Changeset,
  database: DuoDatabase = db,
): Promise<Plan> {
  const tables = Object.keys(ENTITY_SCHEMAS) as EntityTableName[];
  const snapshot = new Map<EntityTableName, Map<string, Record<string, unknown>>>();
  for (const t of tables) {
    const rows = (await database.table(t).toArray()) as Record<string, unknown>[];
    snapshot.set(t, new Map(rows.map((r) => [String(r.id), r])));
  }
  const household = await database.households.toCollection().first();
  if (!household) throw new Error('App ainda não inicializado.');
  const closes = (await database.closes.toArray()).filter((c) => !c.deletedAt);
  const exportedAt = exportTimeOf(changeset.basedOnExportId);

  // Temp ids are resolved up front, so an operation may reference one created later in the file.
  const temps = new Map<string, string>();
  for (const op of changeset.operations) {
    if (op.op === 'create' && op.tempId) temps.set(op.tempId, newId());
  }
  // Grouping ids like installmentGroupId may be temporary without a row of their own.
  const collect = (value: unknown) => {
    if (typeof value === 'string' && /^tmp:/.test(value) && !temps.has(value))
      temps.set(value, newId());
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  for (const op of changeset.operations) {
    if (op.op === 'create') collect(op.data);
    if (op.op === 'update') collect(op.patch);
  }

  const ops: PlannedOp[] = [];
  const counts = { create: 0, update: 0, delete: 0 };
  const created = new Map<EntityTableName, Map<string, Record<string, unknown>>>();
  for (const t of tables) created.set(t, new Map());

  const lookup = (table: EntityTableName, id: string) => {
    const live = snapshot.get(table)!.get(id) ?? created.get(table)!.get(id);
    return live && !live.deletedAt ? live : undefined;
  };

  changeset.operations.forEach((operation, index) => {
    const table = ENTITY_TO_TABLE[operation.entity];
    const planned: PlannedOp = {
      index,
      op: operation.op,
      entity: operation.entity,
      table,
      id: '',
      before: null,
      after: null,
      changed: [],
      reason: operation.reason ?? '',
      errors: [],
      conflicts: [],
      warnings: [],
    };
    counts[operation.op]++;

    if (operation.op === 'create') {
      const data = resolveTemps(operation.data, temps) as Record<string, unknown>;
      const id = operation.tempId ? temps.get(operation.tempId)! : newId();
      const cards = new Map([...snapshot.get('cards')!, ...created.get('cards')!]);
      const row = withDerivedFields(
        operation.entity,
        {
          ...defaultsFor(operation.entity),
          ...stamp(household.id),
          ...data,
          id,
          householdId: household.id,
        },
        cards,
      );
      const parsed = ENTITY_SCHEMAS[table].safeParse(row);
      planned.id = id;
      if (!parsed.success) {
        planned.errors.push(...issueText(parsed.error));
        planned.after = row;
      } else {
        planned.after = parsed.data as Record<string, unknown>;
        created.get(table)!.set(id, planned.after);
      }
    } else if (operation.op === 'update') {
      planned.id = String(resolveTemps(operation.id, temps));
      const existing = lookup(table, planned.id);
      if (!existing) {
        planned.errors.push(`Não existe ${operation.entity} com id ${planned.id}.`);
      } else {
        const patch = resolveTemps(operation.patch, temps) as Record<string, unknown>;
        const cards = new Map([...snapshot.get('cards')!, ...created.get('cards')!]);
        let row: Record<string, unknown> = {
          ...existing,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        // Moving a purchase in time or to another card moves its invoice too.
        if (
          operation.entity === 'transaction' &&
          ('date' in patch || 'cardId' in patch) &&
          !('invoiceMonth' in patch) &&
          !existing.installmentGroupId
        ) {
          row = withDerivedFields(
            operation.entity,
            {
              ...row,
              invoiceMonth: null,
              competenceMonth: 'date' in patch ? null : row.competenceMonth,
            },
            cards,
          );
        }
        const parsed = ENTITY_SCHEMAS[table].safeParse(row);
        planned.before = existing;
        planned.changed = Object.keys(patch).filter(
          (k) => JSON.stringify(existing[k]) !== JSON.stringify(patch[k]),
        );
        if (!parsed.success) {
          planned.errors.push(...issueText(parsed.error));
          planned.after = row;
        } else {
          planned.after = parsed.data as Record<string, unknown>;
        }
        if (exportedAt !== null && new Date(String(existing.updatedAt)).getTime() > exportedAt) {
          planned.conflicts.push('Este registro mudou depois da exportação.');
        }
      }
    } else {
      planned.id = String(resolveTemps(operation.id, temps));
      const existing = lookup(table, planned.id);
      if (!existing) planned.errors.push(`Não existe ${operation.entity} com id ${planned.id}.`);
      else {
        planned.before = existing;
        if (exportedAt !== null && new Date(String(existing.updatedAt)).getTime() > exportedAt) {
          planned.conflicts.push('Este registro mudou depois da exportação.');
        }
      }
    }
    ops.push(planned);
  });

  // Second pass, because a row may reference another one created further down in the file.
  const allTx = [...snapshot.get('transactions')!.values()].filter((t) => !t.deletedAt);
  for (const planned of ops) {
    const row = planned.after;
    if (!row || planned.errors.length > 0) continue;
    for (const [field, target] of REFERENCES) {
      const value = row[field];
      if (typeof value === 'string' && !lookup(target, value)) {
        planned.errors.push(`${field}: "${value}" não existe.`);
      }
    }
    if (Array.isArray(row.tagIds)) {
      for (const tag of row.tagIds) {
        if (!lookup('tags', String(tag)))
          planned.errors.push(`tagIds: "${String(tag)}" não existe.`);
      }
    }
    if (planned.entity === 'transaction') {
      const category =
        typeof row.categoryId === 'string' ? lookup('categories', row.categoryId) : undefined;
      if (category && category.kind !== row.kind) {
        planned.errors.push(
          `A categoria "${String(category.name)}" não serve para este tipo de lançamento.`,
        );
      }
      if (planned.op === 'create') {
        const twin = allTx.find(
          (t) =>
            t.amountCents === row.amountCents &&
            Math.abs(new Date(String(t.date)).getTime() - new Date(String(row.date)).getTime()) <=
              86_400_000 &&
            similarDescriptions(String(t.description), String(row.description)),
        );
        if (twin)
          planned.warnings.push(
            `Parece duplicar "${String(twin.description)}" de ${String(twin.date)}.`,
          );
      }
    }
    const months = [row.competenceMonth, planned.before?.competenceMonth].filter(
      (m): m is string => typeof m === 'string',
    );
    for (const month of new Set(months)) {
      if (isMonthClosed(closes, month)) planned.conflicts.push(`O mês ${month} está fechado.`);
    }
  }

  return { changeset, ops, counts, hasErrors: ops.some((o) => o.errors.length > 0) };
}

export function summarizeCounts(counts: Plan['counts']): string {
  return `+${counts.create} criados, ~${counts.update} editados, −${counts.delete} removidos`;
}

const allTables = (database: DuoDatabase) =>
  (Object.keys(ENTITY_SCHEMAS) as EntityTableName[]).map((t) => database.table(t));

/** Applies the selected operations in one transaction: either all land or none does. */
export async function applyPlan(
  plan: Plan,
  selected: Set<number>,
  database: DuoDatabase = db,
  kind: ImportLog['kind'] = 'changeset',
): Promise<ImportLog> {
  const chosen = plan.ops.filter((o) => selected.has(o.index));
  const invalid = chosen.find((o) => o.errors.length > 0);
  if (invalid) throw new Error(`A operação ${invalid.index + 1} tem erros: ${invalid.errors[0]}`);
  const household = await database.households.toCollection().first();
  if (!household) throw new Error('App ainda não inicializado.');

  const counts = { create: 0, update: 0, delete: 0 };
  for (const o of chosen) counts[o.op]++;
  const inverseOps: ChangeOp[] = [];

  const log: ImportLog = {
    ...stamp(household.id),
    kind,
    appliedAt: new Date().toISOString(),
    summary: plan.changeset.summary?.trim() || summarizeCounts(counts),
    inverseOps,
    undoneAt: null,
  };

  await database.transaction('rw', [...allTables(database), database.importLogs], async () => {
    for (const o of chosen) {
      const table = database.table(o.table) as Table<Record<string, unknown>, string>;
      const existing = (await table.get(o.id)) ?? null;
      inverseOps.push({ table: o.table, id: o.id, before: existing });
      if (o.op === 'delete') {
        const at = new Date().toISOString();
        await table.update(o.id, { deletedAt: at, updatedAt: at });
      } else {
        await table.put(o.after!);
      }
    }
    await database.importLogs.put(log);
  });
  return log;
}

/** Puts back the snapshot of every row the import touched. */
export async function undoImport(logId: string, database: DuoDatabase = db): Promise<void> {
  await database.transaction('rw', [...allTables(database), database.importLogs], async () => {
    const log = await database.importLogs.get(logId);
    if (!log || log.undoneAt) return;
    for (const op of [...log.inverseOps].reverse()) {
      const table = database.table(op.table) as Table<Record<string, unknown>, string>;
      if (op.before) await table.put(op.before as Record<string, unknown>);
      else await table.delete(op.id);
    }
    await database.importLogs.update(logId, { undoneAt: new Date().toISOString() });
  });
}
