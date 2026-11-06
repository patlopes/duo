import { db, type DuoDatabase } from '../db/database';
import { stamp } from '../db/ops';
import { invoiceMonthFor } from '../domain/invoices';
import { parseAmount } from '../domain/money';
import { monthOf } from '../domain/months';
import { applyRules, similarDescriptions } from '../domain/summaries';
import {
  ENTITY_SCHEMAS,
  type CategoryRule,
  type CreditCard,
  type ImportLog,
  type SplitRule,
  type Transaction,
} from '../schemas/entities';

export interface StatementRow {
  date: string;
  description: string;
  /** Signed: negative is money going out, as banks report it. */
  amountCents: number;
  externalId: string | null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** OFX 1.x is SGML with no closing tags; 2.x is XML. This reads a tag's value in both. */
function tagValue(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  return match ? decodeEntities(match[1]!.trim()) : null;
}

export function parseOfx(text: string): StatementRow[] {
  const rows: StatementRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0]!;
    const posted = tagValue(block, 'DTPOSTED');
    const amount = tagValue(block, 'TRNAMT');
    if (!posted || !amount || !/^\d{8}/.test(posted)) continue;
    // Brazilian banks often write "-12,34" even though the spec says a dot.
    const signed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(signed)) continue;
    const memo = tagValue(block, 'MEMO');
    const name = tagValue(block, 'NAME');
    rows.push({
      date: `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}`,
      description: memo || name || 'Sem descrição',
      amountCents: Math.round(signed * 100),
      externalId: tagValue(block, 'FITID'),
    });
  }
  return rows;
}

/** Older OFX files declare a Latin charset in the header, which UTF-8 would turn into garbage. */
export function decodeStatement(bytes: Uint8Array): string {
  const ascii = new TextDecoder('latin1').decode(bytes.slice(0, 600));
  const declared =
    /CHARSET:\s*(1252|8859-?1|ISO-8859-1)/i.test(ascii) ||
    /encoding="(ISO-8859-1|windows-1252)"/i.test(ascii);
  const isUtf8Header = /ENCODING:\s*UTF-?8/i.test(ascii) || /encoding="UTF-8"/i.test(ascii);
  if (declared && !isUtf8Header) return new TextDecoder('windows-1252').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function parseDateText(text: string): string | null {
  const t = text.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (br) {
    const year = br[3]!.length === 2 ? `20${br[3]}` : br[3]!;
    return `${year}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}`;
  }
  return null;
}

export interface CsvTable {
  columns: string[];
  rows: Record<string, string>[];
}

export async function parseCsv(text: string): Promise<CsvTable> {
  const { default: Papa } = await import('papaparse');
  const result = Papa.parse<Record<string, string>>(text.replace(/^\ufeff/, ''), {
    header: true,
    skipEmptyLines: true,
  });
  return { columns: result.meta.fields ?? [], rows: result.data };
}

export interface CsvMapping {
  date: string;
  description: string;
  amount: string;
  invertSign: boolean;
}

export function guessMapping(columns: string[]): Partial<CsvMapping> {
  const find = (re: RegExp) =>
    columns.find((c) => re.test(c.normalize('NFD').replace(/\p{Diacritic}/gu, '')));
  return {
    date: find(/data|date/i),
    description: find(/descri|histor|memo|estabelec|lancamento|title/i),
    amount: find(/valor|amount|quantia/i),
  };
}

export function rowsFromCsv(
  table: CsvTable,
  mapping: CsvMapping,
): { rows: StatementRow[]; skipped: number } {
  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const raw of table.rows) {
    const date = parseDateText(raw[mapping.date] ?? '');
    const amount = parseAmount(raw[mapping.amount] ?? '');
    if (!date || amount === null) {
      skipped++;
      continue;
    }
    rows.push({
      date,
      description: (raw[mapping.description] ?? '').trim() || 'Sem descrição',
      amountCents: mapping.invertSign ? -amount : amount,
      externalId: null,
    });
  }
  return { rows, skipped };
}

export type RowState = 'new' | 'duplicate' | 'maybe_duplicate';

export interface ReviewRow extends StatementRow {
  key: number;
  state: RowState;
  duplicateOf: string | null;
  categoryId: string | null;
  splitRule: SplitRule | null;
  tagIds: string[];
  selected: boolean;
}

/**
 * Same FITID on the same account is the same entry, so it starts unticked. Same amount within a day
 * and a similar description only might be, so it is flagged for a person to decide.
 */
export function buildReview(
  rows: StatementRow[],
  target: { accountId: string | null; cardId: string | null },
  existing: Transaction[],
  rules: CategoryRule[],
): ReviewRow[] {
  const sameTarget = existing.filter((t) =>
    target.cardId ? t.cardId === target.cardId : t.accountId === target.accountId,
  );
  return rows.map((row, key) => {
    const value = Math.abs(row.amountCents);
    const exact = row.externalId
      ? sameTarget.find((t) => t.externalId === row.externalId)
      : undefined;
    const maybe = exact
      ? undefined
      : sameTarget.find(
          (t) =>
            t.amountCents === value &&
            Math.abs(new Date(t.date).getTime() - new Date(row.date).getTime()) <= 86_400_000 &&
            similarDescriptions(t.description, row.description),
        );
    const set = applyRules(rules, row.description, value);
    const state: RowState = exact ? 'duplicate' : maybe ? 'maybe_duplicate' : 'new';
    return {
      ...row,
      key,
      state,
      duplicateOf: (exact ?? maybe)?.description ?? null,
      categoryId: set?.categoryId ?? null,
      splitRule: set?.splitRule ?? null,
      tagIds: set?.tagIds ?? [],
      selected: state === 'new',
    };
  });
}

export async function applyImport(
  review: ReviewRow[],
  target: { accountId: string | null; cardId: string | null; card?: CreditCard | null },
  source: 'ofx' | 'csv',
  database: DuoDatabase = db,
): Promise<ImportLog> {
  const household = await database.households.toCollection().first();
  if (!household) throw new Error('App ainda não inicializado.');
  const chosen = review.filter((r) => r.selected);
  const rows: Transaction[] = chosen.map((r) => {
    const kind = r.amountCents < 0 ? 'expense' : 'income';
    return ENTITY_SCHEMAS.transactions.parse({
      ...stamp(household.id),
      kind,
      amountCents: Math.abs(r.amountCents),
      description: r.description,
      date: r.date,
      competenceMonth: monthOf(r.date),
      accountId: target.accountId,
      cardId: target.cardId,
      invoiceMonth: target.card ? invoiceMonthFor(r.date, target.card) : null,
      categoryId: r.categoryId,
      tagIds: r.tagIds,
      status: target.cardId ? 'pending' : 'paid',
      recurrenceId: null,
      installmentGroupId: null,
      installmentNumber: null,
      installmentTotal: null,
      payerMemberId: null,
      splitRule: r.splitRule ?? 'proportional',
      goalId: null,
      goalItemId: null,
      notes: '',
      attachmentIds: [],
      source,
      externalId: r.externalId,
    });
  });
  const log: ImportLog = {
    ...stamp(household.id),
    kind: source,
    appliedAt: new Date().toISOString(),
    summary: `${rows.length} lançamentos importados de ${source.toUpperCase()}`,
    inverseOps: rows.map((r) => ({ table: 'transactions', id: r.id, before: null })),
    undoneAt: null,
  };
  await database.transaction('rw', database.transactions, database.importLogs, async () => {
    await database.transactions.bulkPut(rows);
    await database.importLogs.put(log);
  });
  return log;
}
