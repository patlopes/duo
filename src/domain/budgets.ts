import type { Budget, Category, Transaction } from '../schemas/entities';
import { addMonths, daysInMonth, dayNumber, monthName, monthOf } from './months';
import { formatBRLRound } from './money';

export type BudgetBarState = 'calm' | 'limit' | 'over';

export const BUDGET_BAR_LABEL: Record<BudgetBarState, string> = {
  calm: 'Tranquilo',
  limit: 'No limite',
  over: 'Estourou',
};

export function budgetBarState(spentCents: number, limitCents: number): BudgetBarState {
  if (limitCents <= 0) return spentCents > 0 ? 'over' : 'calm';
  const ratio = spentCents / limitCents;
  if (ratio > 1) return 'over';
  return ratio >= 0.85 ? 'limit' : 'calm';
}

/** A month override wins over the default; children roll up into their parent category. */
export function effectiveBudget(budgets: Budget[], categoryId: string, month: string): number {
  const override = budgets.find((b) => b.categoryId === categoryId && b.month === month);
  if (override) return override.amountCents;
  return budgets.find((b) => b.categoryId === categoryId && b.month === null)?.amountCents ?? 0;
}

export interface BudgetLine {
  category: Category;
  limitCents: number;
  spentCents: number;
  pendingCents: number;
  committedCents: number;
  state: BudgetBarState;
  /** Spending is ahead of how much of the month has passed. */
  aheadOfPace: boolean;
}

const rollUp = (categories: Category[]) => {
  const parent = new Map(categories.map((c) => [c.id, c.parentId ?? c.id]));
  return (id: string | null) => (id ? (parent.get(id) ?? id) : null);
};

export function budgetLines(
  budgets: Budget[],
  categories: Category[],
  transactions: Transaction[],
  month: string,
  now: string,
): BudgetLine[] {
  const root = rollUp(categories);
  const spent = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.competenceMonth !== month || t.source === 'adjustment') continue;
    const key = root(t.categoryId);
    if (!key) continue;
    // Card purchases are money already spent, even while the invoice is open.
    const bucket = t.status === 'paid' || t.cardId ? spent : pending;
    bucket.set(key, (bucket.get(key) ?? 0) + t.amountCents);
  }
  const elapsed =
    monthOf(now) === month ? dayNumber(now) / daysInMonth(month) : month < monthOf(now) ? 1 : 0;

  return categories
    .filter((c) => c.kind === 'expense' && !c.parentId && !c.system && !c.archived)
    .map((category) => {
      const limitCents = effectiveBudget(budgets, category.id, month);
      const spentCents = spent.get(category.id) ?? 0;
      const pendingCents = pending.get(category.id) ?? 0;
      const committedCents = spentCents + pendingCents;
      return {
        category,
        limitCents,
        spentCents,
        pendingCents,
        committedCents,
        state: budgetBarState(committedCents, limitCents),
        aheadOfPace: limitCents > 0 && spentCents / limitCents > elapsed + 0.1,
      };
    })
    .filter((line) => line.limitCents > 0)
    .sort((a, b) => b.committedCents / b.limitCents - a.committedCents / a.limitCents);
}

export function isShared(t: Pick<Transaction, 'splitRule'>): boolean {
  return t.splitRule === 'proportional' || t.splitRule === 'equal';
}

export type MonthMood =
  'calm' | 'tight' | 'over' | 'within' | 'slightly_over' | 'over_past' | 'no_budget' | 'future';

export interface MonthSummary {
  mood: MonthMood;
  budgetCents: number;
  committedCents: number;
  availableCents: number;
  perDayCents: number | null;
  sentence: string;
}

/** Spec 5.7: judged by what is left, because rent on day 5 makes "% of month" comparisons misleading. */
export function monthSummary(
  budgets: Budget[],
  categories: Category[],
  transactions: Transaction[],
  month: string,
  now: string,
): MonthSummary {
  const lines = budgetLines(budgets, categories, transactions, month, now);
  const budgetCents = lines.reduce((sum, l) => sum + l.limitCents, 0);
  const committedCents = transactions
    .filter(
      (t) =>
        t.kind === 'expense' &&
        t.competenceMonth === month &&
        t.source !== 'adjustment' &&
        // Dream spending comes from money set aside for it, not from the household budget.
        !t.goalId &&
        isShared(t),
    )
    .reduce((sum, t) => sum + t.amountCents, 0);
  const availableCents = budgetCents - committedCents;
  const base = { budgetCents, committedCents, availableCents, perDayCents: null };

  if (budgetCents === 0) {
    return {
      ...base,
      mood: 'no_budget',
      sentence:
        committedCents > 0
          ? `Vocês já gastaram ${formatBRLRound(committedCents)} em ${monthName(month)}. Criem um orçamento para saber quanto ainda dá.`
          : `Ainda sem gastos em ${monthName(month)}.`,
    };
  }

  const thisMonth = monthOf(now);
  if (month > thisMonth) {
    return {
      ...base,
      mood: 'future',
      sentence: `Já estão comprometidos ${formatBRLRound(committedCents)} dos ${formatBRLRound(budgetCents)} de ${monthName(month)}.`,
    };
  }

  if (month < thisMonth) {
    const overBy = committedCents - budgetCents;
    if (overBy <= 0) {
      return {
        ...base,
        mood: 'within',
        sentence: `${capitalize(monthName(month))} fechou dentro do orçamento, com ${formatBRLRound(-overBy)} de folga.`,
      };
    }
    const slight = overBy <= budgetCents * 0.1;
    return {
      ...base,
      mood: slight ? 'slightly_over' : 'over_past',
      sentence: slight
        ? `${capitalize(monthName(month))} fechou um pouco acima: ${formatBRLRound(overBy)} além do orçamento.`
        : `${capitalize(monthName(month))} fechou acima do orçamento, ${formatBRLRound(overBy)} além do previsto.`,
    };
  }

  const daysLeft = daysInMonth(month) - dayNumber(now) + 1;
  const perDayCents = Math.max(0, Math.floor(availableCents / daysLeft));
  if (availableCents < 0) {
    return {
      ...base,
      perDayCents: 0,
      mood: 'over',
      sentence: `O orçamento da casa estourou em ${formatBRLRound(-availableCents)}. Vale segurar até o mês virar.`,
    };
  }
  if (availableCents < budgetCents * 0.15) {
    return {
      ...base,
      perDayCents,
      mood: 'tight',
      sentence: `Mês apertado: restam ${formatBRLRound(availableCents)} do orçamento da casa, cerca de ${formatBRLRound(perDayCents)} por dia.`,
    };
  }
  return {
    ...base,
    perDayCents,
    mood: 'calm',
    sentence: `Mês tranquilo até aqui: ainda sobram ${formatBRLRound(availableCents)} do orçamento da casa.`,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Overrides for `to` copied from what `from` was effectively budgeted. */
export function copyBudgetsFromMonth(
  budgets: Budget[],
  categories: Category[],
  from: string,
): { categoryId: string; amountCents: number }[] {
  return categories
    .filter((c) => c.kind === 'expense')
    .map((c) => ({ categoryId: c.id, amountCents: effectiveBudget(budgets, c.id, from) }))
    .filter((b) => b.amountCents > 0);
}

export function previousMonth(month: string): string {
  return addMonths(month, -1);
}
