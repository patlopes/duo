import type { MemberIncome, SalaryPlan } from '../schemas/entities';
import { addMonths, dayInMonth, monthOf } from './months';

/** The row in force in a month: the latest one that has already started. */
export function salaryOf(plans: SalaryPlan[], memberId: string, month: string): SalaryPlan | null {
  return (
    plans
      .filter((p) => p.memberId === memberId && p.startMonth <= month)
      .sort((a, b) => b.startMonth.localeCompare(a.startMonth))[0] ?? null
  );
}

/** Raises already scheduled for after this month. */
export function upcomingRaises(plans: SalaryPlan[], memberId: string, month: string): SalaryPlan[] {
  return plans
    .filter((p) => p.memberId === memberId && p.startMonth > month)
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth));
}

const HORIZON_MONTHS = 36;

/**
 * Turns salaries into the income rows the split engine reads, so no one has to retype them. A month
 * with income entered by hand keeps it: what actually happened beats what was planned.
 */
export function mergeSalaryIncomes(
  incomes: MemberIncome[],
  plans: SalaryPlan[],
  now: string,
): MemberIncome[] {
  const merged = [...incomes];
  const hasManual = new Set(
    incomes.filter((i) => i.countsForSplit).map((i) => `${i.memberId}|${i.competenceMonth}`),
  );
  const members = new Set(plans.map((p) => p.memberId));
  const last = addMonths(monthOf(now), HORIZON_MONTHS);
  for (const memberId of members) {
    const own = plans.filter((p) => p.memberId === memberId);
    const first = own.reduce((min, p) => (p.startMonth < min ? p.startMonth : min), last);
    for (let month = first; month <= last; month = addMonths(month, 1)) {
      if (hasManual.has(`${memberId}|${month}`)) continue;
      const plan = salaryOf(own, memberId, month);
      if (!plan) continue;
      merged.push({
        id: `salary:${memberId}:${month}`,
        householdId: plan.householdId,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        deletedAt: null,
        memberId,
        competenceMonth: month,
        type: 'salary',
        amountCents: plan.amountCents,
        countsForSplit: true,
      });
    }
  }
  return merged;
}

export function isGeneratedIncome(income: Pick<MemberIncome, 'id'>): boolean {
  return income.id.startsWith('salary:');
}

export interface PayState {
  date: string;
  received: boolean;
  amountCents: number;
}

/** "Entrou no dia 5" or "entra no dia 10": the income updates by itself as the date passes. */
export function payState(plan: SalaryPlan | null, month: string, now: string): PayState | null {
  if (!plan) return null;
  const date = dayInMonth(month, plan.payDay);
  return { date, received: date <= now, amountCents: plan.amountCents };
}
