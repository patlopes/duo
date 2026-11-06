import { addMonths, dayInMonth, dayNumber, monthOf } from './months';
import { splitEvenly } from './money';
import { invoiceMonthFor } from './invoices';
import type { CreditCard, Recurrence } from '../schemas/entities';

export interface InstallmentPlan {
  number: number;
  total: number;
  amountCents: number;
  date: string;
  competenceMonth: string;
  invoiceMonth: string | null;
}

/**
 * Installment k falls k−1 months after the first (spec 5.3). Card installments keep the purchase
 * date, because the invoice month is what moves; account installments move their own date.
 */
export function planInstallments(
  totalCents: number,
  count: number,
  date: string,
  card: Pick<CreditCard, 'closingDay' | 'dueDay'> | null,
): InstallmentPlan[] {
  const firstInvoice = card ? invoiceMonthFor(date, card) : null;
  const startMonth = monthOf(date);
  return splitEvenly(totalCents, count).map((amountCents, i) => ({
    number: i + 1,
    total: count,
    amountCents,
    date: card ? date : dayInMonth(addMonths(startMonth, i), dayNumber(date)),
    competenceMonth: addMonths(startMonth, i),
    invoiceMonth: firstInvoice ? addMonths(firstInvoice, i) : null,
  }));
}

/** Dates of a recurrence after `after` and up to `until`, inclusive. */
export function recurrenceDates(
  rule: Pick<Recurrence, 'frequency' | 'interval' | 'startDate' | 'endDate'>,
  after: string | null,
  until: string,
): string[] {
  const out: string[] = [];
  const limit = rule.endDate && rule.endDate < until ? rule.endDate : until;
  const startDay = dayNumber(rule.startDate);
  const startMonth = monthOf(rule.startDate);
  for (let i = 0; i < 5000; i++) {
    let date: string;
    if (rule.frequency === 'weekly') {
      const d = new Date(`${rule.startDate}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i * 7 * rule.interval);
      date = d.toISOString().slice(0, 10);
    } else {
      const months = i * rule.interval * (rule.frequency === 'yearly' ? 12 : 1);
      date = dayInMonth(addMonths(startMonth, months), startDay);
    }
    if (date > limit) break;
    if (!after || date > after) out.push(date);
  }
  return out;
}
