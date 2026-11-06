import type { Account, CreditCard, Transaction, Transfer } from '../schemas/entities';
import { buildInvoice, invoiceDates } from './invoices';
import { addMonths, lastDayOf } from './months';

/** Spec 5.4. Card purchases never touch an account: only the invoice payment does. */
export function accountBalance(
  account: Account,
  transactions: Transaction[],
  transfers: Transfer[],
  until?: string,
): number {
  let balance = account.initialBalanceCents;
  for (const t of transactions) {
    if (t.accountId !== account.id || t.status !== 'paid') continue;
    if (until && t.date > until) continue;
    balance += t.kind === 'income' ? t.amountCents : -t.amountCents;
  }
  for (const t of transfers) {
    if (t.status !== 'paid') continue;
    if (until && t.date > until) continue;
    if (t.toAccountId === account.id) balance += t.amountCents;
    if (t.fromAccountId === account.id) balance -= t.amountCents;
  }
  return balance;
}

/** Balance plus everything still pending up to `until`. */
export function accountForecast(
  account: Account,
  cards: CreditCard[],
  transactions: Transaction[],
  transfers: Transfer[],
  until: string,
  now: string,
): number {
  let forecast = accountBalance(account, transactions, transfers);
  for (const t of transactions) {
    if (t.accountId !== account.id || t.status !== 'pending' || t.date > until) continue;
    forecast += t.kind === 'income' ? t.amountCents : -t.amountCents;
  }
  for (const t of transfers) {
    if (t.status !== 'pending' || t.date > until) continue;
    if (t.toAccountId === account.id) forecast += t.amountCents;
    if (t.fromAccountId === account.id) forecast -= t.amountCents;
  }
  // Invoices are a promise on the account that pays them, even with no payment recorded yet.
  for (const card of cards) {
    if (card.paymentAccountId !== account.id) continue;
    const months = new Set(
      transactions
        .filter((t) => t.cardId === card.id && t.invoiceMonth)
        .map((t) => t.invoiceMonth!),
    );
    for (const month of months) {
      if (invoiceDates(month, card).due > until) continue;
      forecast -= buildInvoice(card, month, transactions, transfers, now).remainingCents;
    }
  }
  return forecast;
}

export function totalBalance(
  accounts: Account[],
  transactions: Transaction[],
  transfers: Transfer[],
): number {
  return accounts
    .filter((a) => a.includeInTotal && !a.archived)
    .reduce((sum, a) => sum + accountBalance(a, transactions, transfers), 0);
}

export function totalForecast(
  accounts: Account[],
  cards: CreditCard[],
  transactions: Transaction[],
  transfers: Transfer[],
  month: string,
  now: string,
): number {
  return accounts
    .filter((a) => a.includeInTotal && !a.archived)
    .reduce(
      (sum, a) => sum + accountForecast(a, cards, transactions, transfers, lastDayOf(month), now),
      0,
    );
}

export interface StatementLine {
  id: string;
  date: string;
  description: string;
  deltaCents: number;
  balanceCents: number;
  status: 'paid' | 'pending';
  source: Transaction | Transfer;
}

/** Oldest first, with the running balance a bank statement shows. Pending lines do not move it. */
export function accountStatement(
  account: Account,
  transactions: Transaction[],
  transfers: Transfer[],
  describeTransfer: (t: Transfer) => string,
): StatementLine[] {
  const lines: Omit<StatementLine, 'balanceCents'>[] = [];
  for (const t of transactions) {
    if (t.accountId !== account.id) continue;
    lines.push({
      id: t.id,
      date: t.date,
      description: t.description,
      deltaCents: t.kind === 'income' ? t.amountCents : -t.amountCents,
      status: t.status,
      source: t,
    });
  }
  for (const t of transfers) {
    if (t.toAccountId !== account.id && t.fromAccountId !== account.id) continue;
    lines.push({
      id: t.id,
      date: t.date,
      description: describeTransfer(t),
      deltaCents: t.fromAccountId === account.id ? -t.amountCents : t.amountCents,
      status: t.status,
      source: t,
    });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let running = account.initialBalanceCents;
  return lines.map((line) => {
    if (line.status === 'paid') running += line.deltaCents;
    return { ...line, balanceCents: running };
  });
}

/** Closing balance for each month, for the evolution chart. */
export function balanceSeries(
  accounts: Account[],
  transactions: Transaction[],
  transfers: Transfer[],
  lastMonth: string,
  count: number,
): { month: string; balanceCents: number }[] {
  const included = accounts.filter((a) => a.includeInTotal);
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(lastMonth, i - count + 1);
    const end = lastDayOf(month);
    return {
      month,
      balanceCents: included.reduce(
        (sum, a) => sum + accountBalance(a, transactions, transfers, end),
        0,
      ),
    };
  });
}
