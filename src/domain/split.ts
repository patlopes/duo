import type {
  Account,
  CreditCard,
  Goal,
  Household,
  MemberIncome,
  MonthClose,
  SplitRule,
  Transaction,
  Transfer,
} from '../schemas/entities';
import { addMonths } from './months';
import { splitByPct } from './money';

export interface SplitContext {
  household: Pick<Household, 'memberIds'>;
  accounts: Account[];
  cards: CreditCard[];
  goals: Goal[];
  incomes: MemberIncome[];
  closes: MonthClose[];
  transactions: Transaction[];
  transfers: Transfer[];
  /** The couple's choice. Half each overrides income, except in months already closed. */
  splitMode?: 'proportional' | 'equal';
}

function incomeOf(ctx: SplitContext, memberId: string, month: string): number {
  return ctx.incomes
    .filter((i) => i.memberId === memberId && i.competenceMonth === month && i.countsForSplit)
    .reduce((sum, i) => sum + i.amountCents, 0);
}

function activeClose(ctx: SplitContext, month: string): MonthClose | undefined {
  return ctx.closes.find((c) => c.month === month && !c.reopenedAt);
}

/** Share of member A. A closed month keeps its snapshot; a month with no income inherits the last. */
export function memberAPct(ctx: SplitContext, month: string): number {
  const [a, b] = ctx.household.memberIds;
  const closed = activeClose(ctx, month);
  if (closed?.pctByMember[a] !== undefined) return closed.pctByMember[a];
  if (ctx.splitMode === 'equal') return 0.5;
  let current = month;
  for (let hops = 0; hops < 120; hops++) {
    const close = activeClose(ctx, current);
    if (close?.pctByMember[a] !== undefined) return close.pctByMember[a];
    const incomeA = incomeOf(ctx, a, current);
    const incomeB = incomeOf(ctx, b, current);
    if (incomeA + incomeB > 0) return incomeA / (incomeA + incomeB);
    current = addMonths(current, -1);
    // Nothing older can exist before the first recorded income or close.
    if (
      !ctx.incomes.some((i) => i.competenceMonth <= current) &&
      !ctx.closes.some((c) => c.month <= current && !c.reopenedAt)
    ) {
      break;
    }
  }
  return 0.5;
}

/** A's part and B's part of an amount, adding up to it exactly. */
export function shareOf(amount: number, rule: SplitRule, pctA: number): [number, number] {
  if (rule === 'memberA') return [amount, 0];
  if (rule === 'memberB') return [0, amount];
  return splitByPct(amount, rule === 'equal' ? 0.5 : pctA);
}

/**
 * Card purchases count toward their competence month even before the invoice is paid: the money is
 * committed and the owner paid for it. Counting only `paid` (5.5) would leave a month's settlement
 * empty until the invoice comes due, because 5.3 keeps card rows pending until then (DECISIONS D-020).
 */
export function countsForSettlement(t: Transaction, ctx: SplitContext): boolean {
  if (t.kind !== 'expense' || t.source === 'adjustment') return false;
  if (t.status !== 'paid' && !t.cardId) return false;
  // Spending from a goal's fund was already split when the money went in (spec 5.6).
  if (t.goalId && t.accountId) {
    const goal = ctx.goals.find((g) => g.id === t.goalId);
    if (goal?.accountId === t.accountId) return false;
  }
  return true;
}

/** The member who fronted the money, or null when it came from the joint account. */
export function payerOf(t: Transaction, ctx: SplitContext): string | null {
  if (t.cardId) {
    const card = ctx.cards.find((c) => c.id === t.cardId);
    if (card?.ownerMemberId) return card.ownerMemberId;
    return t.payerMemberId;
  }
  const account = ctx.accounts.find((a) => a.id === t.accountId);
  if (account?.type === 'joint' || account?.ownerMemberId === null) return t.payerMemberId;
  return account?.ownerMemberId ?? t.payerMemberId;
}

function ownerOfAccount(ctx: SplitContext, accountId: string | null): string | null {
  return ctx.accounts.find((a) => a.id === accountId)?.ownerMemberId ?? null;
}

export interface JointSuggestion {
  budgetCents: number;
  byMember: [number, number];
}

export function suggestJointDeposits(budgetCents: number, pctA: number): JointSuggestion {
  return { budgetCents, byMember: splitByPct(budgetCents, pctA) };
}

export interface Settlement {
  month: string;
  pctA: number;
  incomeA: number;
  incomeB: number;
  owedA: number;
  owedB: number;
  paidA: number;
  paidB: number;
  /** Positive means B owes A. */
  balanceA: number;
  transfer: { fromMemberId: string; toMemberId: string; amountCents: number } | null;
  /** Share of own income each put into shared bills. */
  fairnessA: number | null;
  fairnessB: number | null;
  rows: Transaction[];
}

export function computeSettlement(ctx: SplitContext, month: string): Settlement {
  const [a, b] = ctx.household.memberIds;
  const pctA = memberAPct(ctx, month);

  const deposits = ctx.transfers.filter(
    (t) => t.kind === 'joint_deposit' && t.competenceMonth === month && t.status === 'paid',
  );
  const depositOf = (member: string) =>
    deposits
      .filter((t) => ownerOfAccount(ctx, t.fromAccountId) === member)
      .reduce((sum, t) => sum + t.amountCents, 0);
  const depositA = depositOf(a);
  const depositB = depositOf(b);
  // With no deposits recorded, the joint account is assumed to have been funded by the agreed split.
  const jointShareA = depositA + depositB > 0 ? depositA / (depositA + depositB) : pctA;

  let owedA = 0;
  let owedB = 0;
  let proportionalA = 0;
  let proportionalB = 0;
  let paidA = 0;
  let paidB = 0;
  const rows: Transaction[] = [];

  for (const t of ctx.transactions) {
    if (t.competenceMonth !== month || !countsForSettlement(t, ctx)) continue;
    rows.push(t);
    const [partA, partB] = shareOf(t.amountCents, t.splitRule, pctA);
    owedA += partA;
    owedB += partB;
    if (t.splitRule === 'proportional') {
      proportionalA += partA;
      proportionalB += partB;
    }
    const payer = payerOf(t, ctx);
    if (payer === a) paidA += t.amountCents;
    else if (payer === b) paidB += t.amountCents;
    else {
      const [jointA, jointB] = splitByPct(t.amountCents, jointShareA);
      paidA += jointA;
      paidB += jointB;
    }
  }

  for (const t of ctx.transfers) {
    if (t.kind !== 'settlement' || t.competenceMonth !== month || t.status !== 'paid') continue;
    const from = ownerOfAccount(ctx, t.fromAccountId);
    if (from === a) {
      paidA += t.amountCents;
      paidB -= t.amountCents;
    } else if (from === b) {
      paidB += t.amountCents;
      paidA -= t.amountCents;
    }
  }

  const balanceA = paidA - owedA;
  const close = activeClose(ctx, month);
  const incomeA = close?.incomeByMember[a] ?? incomeOf(ctx, a, month);
  const incomeB = close?.incomeByMember[b] ?? incomeOf(ctx, b, month);

  let transfer: Settlement['transfer'] = null;
  if (balanceA > 0) transfer = { fromMemberId: b, toMemberId: a, amountCents: balanceA };
  if (balanceA < 0) transfer = { fromMemberId: a, toMemberId: b, amountCents: -balanceA };

  return {
    month,
    pctA,
    incomeA,
    incomeB,
    owedA,
    owedB,
    paidA,
    paidB,
    balanceA,
    transfer,
    fairnessA: incomeA > 0 ? proportionalA / incomeA : null,
    fairnessB: incomeB > 0 ? proportionalB / incomeB : null,
    rows,
  };
}

export function isMonthClosed(closes: MonthClose[], month: string): boolean {
  return closes.some((c) => c.month === month && !c.reopenedAt);
}
