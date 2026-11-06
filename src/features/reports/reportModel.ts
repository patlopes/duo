import type { Data } from '../../db/DataContext';
import { addMonths, dayNumber, daysInMonth, monthShort } from '../../domain/months';
import { monthTotals } from '../../domain/summaries';
import type { Transaction } from '../../schemas/entities';

export function incomeVsExpense(data: Data, month: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const m = addMonths(month, i - count + 1);
    const totals = monthTotals(data.transactions, m);
    return {
      label: monthShort(m),
      month: m,
      income: totals.incomeCents,
      expense: totals.expenseCents,
    };
  });
}

/** Money in and out, accumulated day by day. */
export function cashFlow(data: Data, month: string) {
  const inByDay = new Map<number, number>();
  const outByDay = new Map<number, number>();
  for (const t of data.transactions) {
    if (t.competenceMonth !== month || t.source === 'adjustment') continue;
    const day = t.date.slice(0, 7) === month ? dayNumber(t.date) : 1;
    const bucket = t.kind === 'income' ? inByDay : outByDay;
    bucket.set(day, (bucket.get(day) ?? 0) + t.amountCents);
  }
  let income = 0;
  let expense = 0;
  return Array.from({ length: daysInMonth(month) }, (_, i) => {
    const day = i + 1;
    income += inByDay.get(day) ?? 0;
    expense += outByDay.get(day) ?? 0;
    return { label: String(day), income, expense };
  });
}

export interface ComparisonRow {
  categoryId: string;
  name: string;
  current: number;
  previous: number;
  /** Null when there is nothing to compare against. */
  change: number | null;
}

export function compareCategories(data: Data, month: string): ComparisonRow[] {
  const previous = addMonths(month, -1);
  const parent = new Map(data.categories.map((c) => [c.id, c.parentId ?? c.id]));
  const totals = new Map<string, { current: number; previous: number }>();
  for (const t of data.transactions) {
    if (t.kind !== 'expense' || !t.categoryId || t.source === 'adjustment') continue;
    if (t.competenceMonth !== month && t.competenceMonth !== previous) continue;
    const key = parent.get(t.categoryId) ?? t.categoryId;
    const entry = totals.get(key) ?? { current: 0, previous: 0 };
    if (t.competenceMonth === month) entry.current += t.amountCents;
    else entry.previous += t.amountCents;
    totals.set(key, entry);
  }
  return [...totals.entries()]
    .map(([categoryId, v]) => ({
      categoryId,
      name: data.categories.find((c) => c.id === categoryId)?.name ?? '',
      current: v.current,
      previous: v.previous,
      change: v.previous > 0 ? (v.current - v.previous) / v.previous : null,
    }))
    .sort((a, b) => b.current - a.current);
}

export interface DimensionRow {
  id: string;
  name: string;
  cents: number;
}

function totalBy(
  rows: Transaction[],
  key: (t: Transaction) => string[],
  name: (id: string) => string,
): DimensionRow[] {
  const totals = new Map<string, number>();
  for (const t of rows)
    for (const id of key(t)) totals.set(id, (totals.get(id) ?? 0) + t.amountCents);
  return [...totals.entries()]
    .map(([id, cents]) => ({ id, name: name(id), cents }))
    .sort((a, b) => b.cents - a.cents);
}

export function spendingBy(
  data: Data,
  month: string,
  dimension: 'tag' | 'account' | 'card',
): DimensionRow[] {
  const rows = data.transactions.filter(
    (t) => t.kind === 'expense' && t.competenceMonth === month && t.source !== 'adjustment',
  );
  if (dimension === 'tag') {
    return totalBy(
      rows,
      (t) => t.tagIds,
      (id) => data.tags.find((x) => x.id === id)?.name ?? '',
    );
  }
  if (dimension === 'account') {
    return totalBy(
      rows,
      (t) => (t.accountId ? [t.accountId] : []),
      (id) => data.accounts.find((x) => x.id === id)?.name ?? '',
    );
  }
  return totalBy(
    rows,
    (t) => (t.cardId ? [t.cardId] : []),
    (id) => data.cards.find((x) => x.id === id)?.name ?? '',
  );
}

/** Flat rows for the spreadsheet export. Amounts in reais: this file is for reading, not reimport. */
export function monthRowsForExport(data: Data, month: string): (string | number)[][] {
  const header = [
    'Data',
    'Tipo',
    'Descrição',
    'Categoria',
    'Conta ou cartão',
    'Valor (R$)',
    'Status',
    'Regra',
  ];
  const rows = data.transactions
    .filter((t) => t.competenceMonth === month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [
      t.date,
      t.kind === 'income' ? 'Receita' : 'Despesa',
      t.description,
      data.categories.find((c) => c.id === t.categoryId)?.name ?? '',
      data.accounts.find((a) => a.id === t.accountId)?.name ??
        data.cards.find((c) => c.id === t.cardId)?.name ??
        '',
      (t.kind === 'income' ? t.amountCents : -t.amountCents) / 100,
      t.status === 'paid' ? 'Pago' : 'Pendente',
      t.splitRule,
    ]);
  return [header, ...rows];
}
