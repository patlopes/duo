import type {
  Account,
  Category,
  CreditCard,
  Goal,
  GoalMovement,
  Household,
  MemberIncome,
  MonthClose,
  Recurrence,
  SalaryPlan,
  Transaction,
  Transfer,
} from '../schemas/entities';
import { accountBalance } from './balances';
import { isShared } from './budgets';
import { emergencyTarget, goalMetrics } from './goals';
import { splitByPct } from './money';
import { addMonths, monthOf } from './months';
import { salaryOf } from './salary';
import { memberAPct, payerOf, shareOf, type SplitContext } from './split';

export interface PlanData {
  household: Pick<Household, 'memberIds'>;
  accounts: Account[];
  cards: CreditCard[];
  goals: Goal[];
  goalMovements: GoalMovement[];
  categories: Category[];
  incomes: MemberIncome[];
  salaryPlans?: SalaryPlan[];
  closes: MonthClose[];
  transactions: Transaction[];
  transfers: Transfer[];
  recurrences: Recurrence[];
  emergencyMonths: number;
  splitMode?: 'proportional' | 'equal';
}

const toSplitContext = (d: PlanData, mode?: 'proportional' | 'equal'): SplitContext => ({
  household: d.household,
  accounts: d.accounts,
  cards: d.cards,
  goals: d.goals,
  incomes: d.incomes,
  closes: d.closes,
  transactions: d.transactions,
  transfers: d.transfers,
  splitMode: mode ?? d.splitMode,
});

/**
 * A bill the couple pays together. Personal spending is deliberately out of this picture, and so is
 * dream spending paid from its fund, since that money was already set aside.
 */
export function isSharedBill(t: Transaction, goals: Goal[]): boolean {
  if (t.kind !== 'expense' || t.source === 'adjustment' || !isShared(t)) return false;
  if (t.goalId && t.accountId) {
    if (goals.find((g) => g.id === t.goalId)?.accountId === t.accountId) return false;
  }
  return true;
}

export function billsOf(transactions: Transaction[], goals: Goal[], month: string): Transaction[] {
  return transactions
    .filter((t) => t.competenceMonth === month && isSharedBill(t, goals))
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
}

export function jointAccountOf(accounts: Account[]): Account | undefined {
  return accounts.find((a) => a.type === 'joint' && !a.archived);
}

export interface DreamLine {
  goal: Goal;
  monthlyCents: number;
}

/** What each dream asks for this month, not counting this month's own contributions. */
export function dreamLines(d: PlanData, month: string, now: string): DreamLine[] {
  const earlier = d.goalMovements.filter((m) => m.competenceMonth < month);
  // Asked as of the start of the month, so a contribution doesn't shrink what the month required.
  const reference = month > monthOf(now) ? `${month}-01` : now;
  return d.goals
    .filter((g) => g.status === 'active' && g.targetDate)
    .map((goal) => {
      const target =
        goal.type === 'emergency'
          ? emergencyTarget(d.emergencyMonths, d.transactions, d.categories, d.closes, now)
          : (goal.targetCents ?? 0);
      const metrics = goalMetrics(goal, target, earlier, d.transactions, reference);
      return { goal, monthlyCents: metrics.neededPerMonthCents ?? 0 };
    })
    .filter((line) => line.monthlyCents > 0);
}

export interface Bucket {
  key: string;
  name: string;
  icon: string;
  color: string;
  totalCents: number;
  paidCents: number;
  bills: Transaction[];
  dream?: DreamLine;
}

/** "So much for housing, so much for the wedding": the shape the couple thinks about the month in. */
export function buildBuckets(
  bills: Transaction[],
  dreams: DreamLine[],
  categories: Category[],
): Bucket[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const buckets = new Map<string, Bucket>();
  for (const bill of bills) {
    const category = bill.categoryId ? byId.get(bill.categoryId) : undefined;
    const root = category?.parentId ? byId.get(category.parentId) : category;
    const key = root?.id ?? '__none';
    const bucket = buckets.get(key) ?? {
      key,
      name: root?.name ?? 'Contas do casal',
      icon: root?.icon ?? 'receipt',
      color: root?.color ?? '#6E2F6B',
      totalCents: 0,
      paidCents: 0,
      bills: [],
    };
    bucket.bills.push(bill);
    bucket.totalCents += bill.amountCents;
    if (bill.status === 'paid' || bill.cardId) bucket.paidCents += bill.amountCents;
    buckets.set(key, bucket);
  }
  const billBuckets = [...buckets.values()].sort((a, b) => b.totalCents - a.totalCents);
  const dreamBuckets = dreams.map((dream): Bucket => ({
    key: `goal:${dream.goal.id}`,
    name: `Guardar: ${dream.goal.name}`,
    icon: 'piggy',
    color: '#e87ba4',
    totalCents: dream.monthlyCents,
    paidCents: 0,
    bills: [],
    dream,
  }));
  return [...billBuckets, ...dreamBuckets];
}

/** Both ways of dividing the same amount, so the couple can compare them side by side. */
function sharesFor(bills: Transaction[], dreams: DreamLine[], pctA: number): [number, number] {
  const share: [number, number] = [0, 0];
  for (const bill of bills) {
    const [a, b] = shareOf(bill.amountCents, bill.splitRule, pctA);
    share[0] += a;
    share[1] += b;
  }
  for (const { goal, monthlyCents } of dreams) {
    const [a, b] = shareOf(monthlyCents, goal.splitRule, pctA);
    share[0] += a;
    share[1] += b;
  }
  return share;
}

function equalShares(total: number): [number, number] {
  return splitByPct(total, 0.5);
}

export interface MonthPlan {
  month: string;
  /** What the couple earns together this month. */
  incomeCents: number;
  incomeByMember: [number, number];
  hasIncome: boolean;
  bills: Transaction[];
  buckets: Bucket[];
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  overdue: Transaction[];
  dreams: DreamLine[];
  dreamsCents: number;
  /** Bills plus what the dreams ask for. */
  toPayCents: number;
  /** What is left of the income after everything the couple pays together. */
  leftoverCents: number;
  pctA: number;
  incomePctA: number;
  /** What each one owes under the chosen split. */
  share: [number, number];
  shareIfProportional: [number, number];
  shareIfEqual: [number, number];
  /** Already done: joint deposits, bills paid out of pocket and dream contributions. */
  covered: [number, number];
  missing: [number, number];
  /** What each keeps for themself. */
  leftoverByMember: [number, number];
  /** First bill still to be paid, which is when the money has to be there. */
  deadline: string | null;
  joint: Account | undefined;
  jointBalanceCents: number | null;
  /** Bills still to pay beyond what is in the joint account. */
  jointShortfallCents: number;
  allPaid: boolean;
}

function monthIncome(d: PlanData, memberId: string, month: string): number {
  return d.incomes
    .filter((i) => i.memberId === memberId && i.competenceMonth === month && i.countsForSplit)
    .reduce((sum, i) => sum + i.amountCents, 0);
}

export function buildMonthPlan(d: PlanData, month: string, now: string): MonthPlan {
  const ctx = toSplitContext(d);
  const [a, b] = d.household.memberIds;
  const pctA = memberAPct(ctx, month);
  const incomePctA = memberAPct(toSplitContext(d, 'proportional'), month);
  const bills = billsOf(d.transactions, d.goals, month);
  const dreams = dreamLines(d, month, now);

  const covered: [number, number] = [0, 0];
  const credit = (memberId: string | null, cents: number) => {
    if (memberId === a) covered[0] += cents;
    else if (memberId === b) covered[1] += cents;
  };

  let paidCents = 0;
  for (const bill of bills) {
    if (bill.status === 'paid' || bill.cardId !== null) {
      paidCents += bill.amountCents;
      // Whoever fronted a bill from their own money has already done their part of it.
      credit(payerOf(bill, ctx), bill.amountCents);
    }
  }
  for (const m of d.goalMovements) {
    if (m.competenceMonth === month && m.kind === 'contribution') credit(m.memberId, m.amountCents);
  }
  const owner = (accountId: string | null) =>
    d.accounts.find((x) => x.id === accountId)?.ownerMemberId ?? null;
  for (const t of d.transfers) {
    if (t.kind === 'joint_deposit' && t.competenceMonth === month && t.status === 'paid') {
      credit(owner(t.fromAccountId), t.amountCents);
    }
  }

  const totalCents = bills.reduce((sum, bill) => sum + bill.amountCents, 0);
  const dreamsCents = dreams.reduce((sum, line) => sum + line.monthlyCents, 0);
  const toPayCents = totalCents + dreamsCents;
  const pending = bills.filter((bill) => bill.status === 'pending' && !bill.cardId);
  const pendingCents = pending.reduce((sum, bill) => sum + bill.amountCents, 0);
  const joint = jointAccountOf(d.accounts);
  const jointBalanceCents = joint ? accountBalance(joint, d.transactions, d.transfers) : null;

  const incomeByMember: [number, number] = [monthIncome(d, a, month), monthIncome(d, b, month)];
  const incomeCents = incomeByMember[0] + incomeByMember[1];
  const share = sharesFor(bills, dreams, pctA);

  return {
    month,
    incomeCents,
    incomeByMember,
    hasIncome: incomeCents > 0,
    bills,
    buckets: buildBuckets(bills, dreams, d.categories),
    totalCents,
    paidCents,
    pendingCents,
    overdue: pending.filter((bill) => bill.date < now),
    dreams,
    dreamsCents,
    toPayCents,
    leftoverCents: incomeCents - toPayCents,
    pctA,
    incomePctA,
    share,
    shareIfProportional: sharesFor(bills, dreams, incomePctA),
    shareIfEqual: equalShares(toPayCents),
    covered,
    missing: [Math.max(0, share[0] - covered[0]), Math.max(0, share[1] - covered[1])],
    leftoverByMember: [incomeByMember[0] - share[0], incomeByMember[1] - share[1]],
    deadline: pending[0]?.date ?? null,
    joint,
    jointBalanceCents,
    jointShortfallCents: Math.max(0, pendingCents - Math.max(0, jointBalanceCents ?? 0)),
    allPaid: bills.length > 0 && pending.length === 0,
  };
}

export interface Scenario {
  /** Monthly salary to assume, per member, from `salaryFrom` on. Null keeps what is planned. */
  salary?: [number | null, number | null];
  salaryFrom?: string;
  /** A new recurring bill, as if it already existed. */
  extraMonthlyCents?: number;
  /** A one-time purchase in a given month. */
  oneOff?: { month: string; cents: number } | null;
  mode?: 'proportional' | 'equal';
}

export interface ProjectedMonth {
  month: string;
  incomeByMember: [number, number];
  incomeCents: number;
  toPayCents: number;
  oneOffCents: number;
  /** Under the scenario's split. */
  share: [number, number];
  shareIfProportional: [number, number];
  shareIfEqual: [number, number];
  leftoverCents: number;
  leftoverByMember: [number, number];
  /** Leftovers added up from the first projected month: what could pile up if nothing else changes. */
  accumulatedCents: number;
}

/** The months ahead under a what-if. Nothing here touches the saved data. */
export function projectMonths(
  d: PlanData,
  now: string,
  count: number,
  scenario: Scenario = {},
): ProjectedMonth[] {
  const [a, b] = d.household.memberIds;
  const mode = scenario.mode ?? d.splitMode ?? 'proportional';
  const start = monthOf(now);
  const from = scenario.salaryFrom ?? start;
  let accumulatedCents = 0;

  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(start, i);
    const income = (memberId: string, index: 0 | 1) => {
      const override = scenario.salary?.[index];
      if (override !== null && override !== undefined && month >= from) return override;
      const planned = monthIncome(d, memberId, month);
      if (planned > 0) return planned;
      // Beyond the generated horizon, the salary in force is still the best guess.
      return d.salaryPlans ? (salaryOf(d.salaryPlans, memberId, month)?.amountCents ?? 0) : 0;
    };
    const incomeByMember: [number, number] = [income(a, 0), income(b, 1)];
    const incomeCents = incomeByMember[0] + incomeByMember[1];
    const incomePct = incomeCents > 0 ? incomeByMember[0] / incomeCents : 0.5;

    const bills = billsOf(d.transactions, d.goals, month);
    const dreams = dreamLines(d, month, now);
    const oneOffCents = scenario.oneOff?.month === month ? scenario.oneOff.cents : 0;
    const extra = (scenario.extraMonthlyCents ?? 0) + oneOffCents;

    const base = sharesFor(bills, dreams, incomePct);
    const [extraA, extraB] = splitByPct(extra, incomePct);
    const shareIfProportional: [number, number] = [base[0] + extraA, base[1] + extraB];
    const toPayCents = shareIfProportional[0] + shareIfProportional[1];
    const shareIfEqual = equalShares(toPayCents);
    const share = mode === 'equal' ? shareIfEqual : shareIfProportional;
    const leftoverCents = incomeCents - toPayCents;
    accumulatedCents += leftoverCents;

    return {
      month,
      incomeByMember,
      incomeCents,
      toPayCents,
      oneOffCents,
      share,
      shareIfProportional,
      shareIfEqual,
      leftoverCents,
      leftoverByMember: [incomeByMember[0] - share[0], incomeByMember[1] - share[1]],
      accumulatedCents,
    };
  });
}

export interface FutureMonth {
  month: string;
  totalCents: number;
  fixedCents: number;
  oneOff: Transaction[];
  share: [number, number];
}

/** The months ahead, with what is out of the ordinary called out: that is why anyone looks here. */
export function futureMonths(d: PlanData, now: string, count: number): FutureMonth[] {
  const ctx = toSplitContext(d);
  const start = monthOf(now);
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(start, i + 1);
    const pctA = memberAPct(ctx, month);
    const bills = billsOf(d.transactions, d.goals, month);
    const share = sharesFor(bills, [], pctA);
    const oneOff = bills.filter((bill) => !bill.recurrenceId);
    const totalCents = bills.reduce((sum, bill) => sum + bill.amountCents, 0);
    return {
      month,
      totalCents,
      fixedCents: totalCents - oneOff.reduce((sum, bill) => sum + bill.amountCents, 0),
      oneOff,
      share,
    };
  });
}

/** Active recurring bills, each with the row a change "from now on" should start from. */
export function fixedBills(
  recurrences: Recurrence[],
  transactions: Transaction[],
  now: string,
): { recurrence: Recurrence; next: Transaction | undefined; last: Transaction | undefined }[] {
  return recurrences
    .map((recurrence) => {
      const rows = transactions
        .filter((t) => t.recurrenceId === recurrence.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        recurrence,
        next:
          rows.find((t) => t.date >= now && t.status === 'pending') ??
          rows.find((t) => t.date >= now),
        last: rows.at(-1),
      };
    })
    .filter((item) => item.last !== undefined && item.last.date >= now)
    .sort((a, b) =>
      a.recurrence.template.description.localeCompare(b.recurrence.template.description),
    );
}
