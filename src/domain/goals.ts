import type {
  Category,
  Goal,
  GoalItem,
  GoalMovement,
  MonthClose,
  SplitRule,
  Transaction,
} from '../schemas/entities';
import { addMonths, monthDiff, monthOf } from './months';

export type GoalHealth = 'on_track' | 'attention' | 'late' | 'paused' | 'done';

export const GOAL_HEALTH_LABEL: Record<GoalHealth, string> = {
  on_track: 'No ritmo',
  attention: 'Atenção',
  late: 'Atrasado',
  paused: 'Pausado',
  done: 'Concluído',
};

export interface GoalMetrics {
  accumulatedCents: number;
  spentFromFundCents: number;
  spentOutOfPocketCents: number;
  baseCents: number;
  targetCents: number;
  progress: number;
  remainingCents: number;
  monthsLeft: number | null;
  neededPerMonthCents: number | null;
  paceCents: number;
  forecastMonth: string | null;
  health: GoalHealth;
}

function signed(m: GoalMovement): number {
  return m.kind === 'withdrawal' ? -m.amountCents : m.amountCents;
}

export function goalMetrics(
  goal: Goal,
  targetCents: number,
  movements: GoalMovement[],
  transactions: Transaction[],
  now: string,
): GoalMetrics {
  const own = movements.filter((m) => m.goalId === goal.id);
  const accumulatedCents = own.reduce((sum, m) => sum + signed(m), 0);
  const spending = transactions.filter(
    (t) => t.goalId === goal.id && t.kind === 'expense' && t.status === 'paid',
  );
  const fromFund = (t: Transaction) => goal.accountId !== null && t.accountId === goal.accountId;
  const spentFromFundCents = spending.filter(fromFund).reduce((s, t) => s + t.amountCents, 0);
  const spentOutOfPocketCents = spending
    .filter((t) => !fromFund(t))
    .reduce((s, t) => s + t.amountCents, 0);

  // A project measures what was raised, even after the money has been spent on it.
  const baseCents =
    goal.reportedBalanceCents ??
    (goal.type === 'project' ? accumulatedCents : accumulatedCents - spentFromFundCents);

  const progress = targetCents > 0 ? Math.min(1, Math.max(0, baseCents / targetCents)) : 0;
  const remainingCents = Math.max(0, targetCents - baseCents);

  const thisMonth = monthOf(now);
  const monthsLeft = goal.targetDate
    ? Math.max(1, monthDiff(thisMonth, monthOf(goal.targetDate)))
    : null;
  const neededPerMonthCents = monthsLeft ? Math.ceil(remainingCents / monthsLeft) : null;

  const window = new Set([0, 1, 2].map((i) => addMonths(thisMonth, -i)));
  const contributed = own
    .filter((m) => m.kind === 'contribution' && window.has(m.competenceMonth))
    .reduce((sum, m) => sum + m.amountCents, 0);
  const paceCents = Math.round(contributed / 3);
  const forecastMonth =
    remainingCents === 0
      ? thisMonth
      : paceCents > 0
        ? addMonths(thisMonth, Math.ceil(remainingCents / paceCents))
        : null;

  let health: GoalHealth;
  if (goal.status === 'paused') health = 'paused';
  else if (goal.status === 'done' || (targetCents > 0 && baseCents >= targetCents)) health = 'done';
  else if (neededPerMonthCents === null || paceCents >= neededPerMonthCents) health = 'on_track';
  else if (paceCents >= neededPerMonthCents * 0.8) health = 'attention';
  else health = 'late';

  return {
    accumulatedCents,
    spentFromFundCents,
    spentOutOfPocketCents,
    baseCents,
    targetCents,
    progress,
    remainingCents,
    monthsLeft,
    neededPerMonthCents,
    paceCents,
    forecastMonth,
    health,
  };
}

/** N months of average essential spending over the last 6 closed months with data, in hundreds. */
export function emergencyTarget(
  months: number,
  transactions: Transaction[],
  categories: Category[],
  closes: MonthClose[],
  now: string,
): number {
  const essential = new Set(categories.filter((c) => c.nature === 'essential').map((c) => c.id));
  const byMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || !t.categoryId || !essential.has(t.categoryId)) continue;
    if (t.source === 'adjustment') continue;
    byMonth.set(t.competenceMonth, (byMonth.get(t.competenceMonth) ?? 0) + t.amountCents);
  }
  const closed = new Set(closes.filter((c) => !c.reopenedAt).map((c) => c.month));
  const thisMonth = monthOf(now);
  // Before anything is closed, past months are the best evidence available.
  const eligible = [...byMonth.keys()]
    .filter((m) => (closed.size > 0 ? closed.has(m) : m < thisMonth))
    .sort()
    .slice(-6);
  if (eligible.length === 0) return 0;
  const average = eligible.reduce((sum, m) => sum + byMonth.get(m)!, 0) / eligible.length;
  return Math.round((months * average) / 10_000) * 10_000;
}

export type ItemState = 'paid' | 'scheduled' | 'partial' | 'to_hire';

export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  paid: 'Pago',
  scheduled: 'Agendado',
  partial: 'Pago em parte',
  to_hire: 'A contratar',
};

export interface ItemProgress {
  paidCents: number;
  scheduledCents: number;
  state: ItemState;
}

export function itemProgress(item: GoalItem, transactions: Transaction[]): ItemProgress {
  const rows = transactions.filter((t) => t.goalItemId === item.id && t.kind === 'expense');
  const paidCents = rows.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amountCents, 0);
  const scheduledCents = rows
    .filter((t) => t.status === 'pending')
    .reduce((s, t) => s + t.amountCents, 0);
  let state: ItemState = 'to_hire';
  if (paidCents > 0 && paidCents + scheduledCents >= item.budgetCents && scheduledCents === 0) {
    state = 'paid';
  } else if (paidCents > 0) state = 'partial';
  else if (scheduledCents > 0) state = 'scheduled';
  return { paidCents, scheduledCents, state };
}

export interface GoalFairness {
  contributedA: number;
  contributedB: number;
  expectedA: number;
  expectedB: number;
  /** Positive means A has put in more than their part. */
  deviationA: number;
}

/** Each contribution is judged by the split of the month it was made in (spec 5.6). */
export function goalFairness(
  goal: Pick<Goal, 'id' | 'splitRule'>,
  movements: GoalMovement[],
  memberIds: [string, string],
  pctAOf: (month: string) => number,
): GoalFairness {
  const [a, b] = memberIds;
  const rulePct = (rule: SplitRule, month: string) =>
    rule === 'equal' ? 0.5 : rule === 'memberA' ? 1 : rule === 'memberB' ? 0 : pctAOf(month);
  let contributedA = 0;
  let contributedB = 0;
  let expectedA = 0;
  let total = 0;
  for (const m of movements) {
    if (m.goalId !== goal.id) continue;
    const value = signed(m);
    if (m.memberId === a) contributedA += value;
    else if (m.memberId === b) contributedB += value;
    expectedA += value * rulePct(goal.splitRule, m.competenceMonth);
    total += value;
  }
  const roundedA = Math.round(expectedA);
  return {
    contributedA,
    contributedB,
    expectedA: roundedA,
    expectedB: total - roundedA,
    deviationA: contributedA - roundedA,
  };
}
