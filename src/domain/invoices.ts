import type { CreditCard, Transaction, Transfer } from '../schemas/entities';
import { addDays, addMonths, dayInMonth, monthOf } from './months';

type CardDays = Pick<CreditCard, 'closingDay' | 'dueDay'>;

/** The first closing strictly after the purchase: buying on closing day falls in the next invoice. */
export function closingAfter(purchase: string, closingDay: number): string {
  const month = monthOf(purchase);
  const thisMonth = dayInMonth(month, closingDay);
  return thisMonth > purchase ? thisMonth : dayInMonth(addMonths(month, 1), closingDay);
}

/** The first due day after that closing. */
export function dueAfter(closing: string, dueDay: number): string {
  const month = monthOf(closing);
  const thisMonth = dayInMonth(month, dueDay);
  return thisMonth > closing ? thisMonth : dayInMonth(addMonths(month, 1), dueDay);
}

/** An invoice is named after the month it falls due (spec 5.2). */
export function invoiceMonthFor(purchase: string, card: CardDays): string {
  return monthOf(dueAfter(closingAfter(purchase, card.closingDay), card.dueDay));
}

export function invoiceDates(invoiceMonth: string, card: CardDays) {
  const due = dayInMonth(invoiceMonth, card.dueDay);
  const candidate = dayInMonth(invoiceMonth, card.closingDay);
  const closing =
    candidate < due ? candidate : dayInMonth(addMonths(invoiceMonth, -1), card.closingDay);
  const previousClosing = dayInMonth(addMonths(monthOf(closing), -1), card.closingDay);
  return { closing, due, periodStart: previousClosing, periodEnd: addDays(closing, -1) };
}

export type InvoiceStatus = 'open' | 'closed' | 'paid' | 'overdue';

export interface Invoice {
  cardId: string;
  month: string;
  closing: string;
  due: string;
  periodStart: string;
  periodEnd: string;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  status: InvoiceStatus;
  items: Transaction[];
}

export function buildInvoice(
  card: CreditCard,
  month: string,
  transactions: Transaction[],
  transfers: Transfer[],
  now: string,
): Invoice {
  const dates = invoiceDates(month, card);
  const items = transactions.filter((t) => t.cardId === card.id && t.invoiceMonth === month);
  // A refund on the card is an income row and lowers the invoice.
  const totalCents = items.reduce(
    (sum, t) => sum + (t.kind === 'income' ? -t.amountCents : t.amountCents),
    0,
  );
  const paidCents = transfers
    .filter(
      (t) =>
        t.kind === 'invoice_payment' &&
        t.toCardId === card.id &&
        t.invoiceMonth === month &&
        t.status === 'paid',
    )
    .reduce((sum, t) => sum + t.amountCents, 0);

  let status: InvoiceStatus;
  if (totalCents > 0 && paidCents >= totalCents) status = 'paid';
  else if (totalCents > 0 && now > dates.due) status = 'overdue';
  else if (now >= dates.closing) status = 'closed';
  else status = 'open';

  return {
    cardId: card.id,
    month,
    ...dates,
    totalCents,
    paidCents,
    remainingCents: Math.max(0, totalCents - paidCents),
    status,
    items,
  };
}

/** Every invoice with activity, plus the one for today so a new card still shows something. */
export function cardInvoices(
  card: CreditCard,
  transactions: Transaction[],
  transfers: Transfer[],
  now: string,
): Invoice[] {
  const months = new Set<string>([invoiceMonthFor(now, card)]);
  for (const t of transactions) {
    if (t.cardId === card.id && t.invoiceMonth) months.add(t.invoiceMonth);
  }
  return [...months].sort().map((m) => buildInvoice(card, m, transactions, transfers, now));
}

/** Limit minus everything not yet paid, future installments included (spec 2.4). */
export function availableLimit(
  card: CreditCard,
  transactions: Transaction[],
  transfers: Transfer[],
  now: string,
): number {
  const committed = cardInvoices(card, transactions, transfers, now).reduce(
    (sum, invoice) => sum + invoice.remainingCents,
    0,
  );
  return card.limitCents - committed;
}

/** The day after closing buys the longest float. */
export function bestPurchaseDay(card: CardDays, now: string): string {
  return addDays(closingAfter(addDays(now, -1), card.closingDay), 1);
}
