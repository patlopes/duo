import type { Category, CategoryRule, Transaction } from '../schemas/entities';
import { isShared } from './budgets';

export interface MonthTotals {
  incomeCents: number;
  expenseCents: number;
}

/** Adjustments correct a balance; they are not income or spending. */
export function monthTotals(transactions: Transaction[], month: string): MonthTotals {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const t of transactions) {
    if (t.competenceMonth !== month || t.source === 'adjustment') continue;
    if (t.kind === 'income') incomeCents += t.amountCents;
    else expenseCents += t.amountCents;
  }
  return { incomeCents, expenseCents };
}

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  cents: number;
  share: number;
}

/** Spending per top-level category, largest first. */
export function categorySlices(
  transactions: Transaction[],
  categories: Category[],
  month: string,
  parentId: string | null = null,
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string | null, number>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.competenceMonth !== month || t.source === 'adjustment') continue;
    const category = t.categoryId ? byId.get(t.categoryId) : undefined;
    let key: string | null;
    if (parentId) {
      if (t.categoryId !== parentId && category?.parentId !== parentId) continue;
      key = category?.id ?? null;
    } else {
      key = category ? (category.parentId ?? category.id) : null;
    }
    totals.set(key, (totals.get(key) ?? 0) + t.amountCents);
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([categoryId, cents]) => {
      const c = categoryId ? byId.get(categoryId) : undefined;
      return {
        categoryId,
        name: c?.name ?? 'Sem categoria',
        color: c?.color ?? '#8E8A86',
        icon: c?.icon ?? 'question',
        cents,
        share: grand > 0 ? cents / grand : 0,
      };
    })
    .sort((a, b) => b.cents - a.cents);
}

export function topSlices(slices: CategorySlice[], count = 5): CategorySlice[] {
  if (slices.length <= count + 1) return slices;
  const rest = slices.slice(count);
  const cents = rest.reduce((sum, s) => sum + s.cents, 0);
  return [
    ...slices.slice(0, count),
    {
      categoryId: '__other',
      name: 'Outras',
      color: '#B8B2AC',
      icon: 'dots',
      cents,
      share: rest.reduce((sum, s) => sum + s.share, 0),
    },
  ];
}

export interface DayGroup<T> {
  date: string;
  totalCents: number;
  items: T[];
}

/** Newest day first; the total counts expenses against income. */
export function groupByDay<T extends { date: string; signedCents: number }>(
  items: T[],
): DayGroup<T>[] {
  const days = new Map<string, DayGroup<T>>();
  for (const item of items) {
    let group = days.get(item.date);
    if (!group) {
      group = { date: item.date, totalCents: 0, items: [] };
      days.set(item.date, group);
    }
    group.items.push(item);
    group.totalCents += item.signedCents;
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** "Where the money escaped": discretionary shared spending, no fixed bills or personal items. */
export function moneyLeaks(
  transactions: Transaction[],
  categories: Category[],
  month: string,
  limit = 10,
): Transaction[] {
  const lifestyle = new Set(categories.filter((c) => c.nature === 'lifestyle').map((c) => c.id));
  return transactions
    .filter(
      (t) =>
        t.kind === 'expense' &&
        t.competenceMonth === month &&
        t.source !== 'adjustment' &&
        !t.recurrenceId &&
        isShared(t) &&
        t.categoryId !== null &&
        lifestyle.has(t.categoryId),
    )
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, limit);
}

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Word overlap: good enough for "UBER *TRIP" against "Uber trip". */
export function similarDescriptions(a: string, b: string): boolean {
  const words = (s: string) =>
    new Set(
      normalizeText(s)
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.5;
}

export function ruleMatches(rule: CategoryRule, description: string, amountCents: number): boolean {
  const { contains, regex, amountCents: exact } = rule.match;
  if (contains === undefined && regex === undefined && exact === undefined) return false;
  if (contains !== undefined && !normalizeText(description).includes(normalizeText(contains))) {
    return false;
  }
  if (regex !== undefined) {
    try {
      if (!new RegExp(regex, 'i').test(description)) return false;
    } catch {
      return false;
    }
  }
  return exact === undefined || exact === amountCents;
}

/** The first matching rule wins, which gives the user a predictable order. */
export function applyRules(
  rules: CategoryRule[],
  description: string,
  amountCents: number,
): CategoryRule['set'] | null {
  return rules.find((r) => ruleMatches(r, description, amountCents))?.set ?? null;
}

export interface HistorySuggestion {
  description: string;
  categoryId: string | null;
  accountId: string | null;
  cardId: string | null;
  splitRule: Transaction['splitRule'];
}

/** Autocomplete from what was typed before, most recent and most frequent first. */
export function descriptionSuggestions(
  transactions: Transaction[],
  query: string,
  kind: Transaction['kind'],
  limit = 5,
): HistorySuggestion[] {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const seen = new Map<string, { row: Transaction; count: number }>();
  for (const t of transactions) {
    if (t.kind !== kind || !t.description) continue;
    const key = normalizeText(t.description);
    if (!key.includes(q) || key === q) continue;
    const entry = seen.get(key);
    if (!entry) seen.set(key, { row: t, count: 1 });
    else {
      entry.count++;
      if (t.date > entry.row.date) entry.row = t;
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || b.row.date.localeCompare(a.row.date))
    .slice(0, limit)
    .map(({ row }) => ({
      description: row.description,
      categoryId: row.categoryId,
      accountId: row.accountId,
      cardId: row.cardId,
      splitRule: row.splitRule,
    }));
}

/** After the same description was corrected to the same category twice, offer to make it a rule. */
export function suggestRuleFromCorrections(
  corrections: { description: string; categoryId: string }[],
  rules: CategoryRule[],
): { contains: string; categoryId: string } | null {
  const last = corrections.at(-1);
  if (!last) return null;
  const key = normalizeText(last.description);
  const repeated = corrections.filter(
    (c) => normalizeText(c.description) === key && c.categoryId === last.categoryId,
  ).length;
  if (repeated < 2 || rules.some((r) => ruleMatches(r, last.description, 0))) return null;
  return { contains: last.description.trim(), categoryId: last.categoryId };
}
