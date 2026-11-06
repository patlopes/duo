import type { Data } from '../db/DataContext';
import { invoiceMonthFor } from './invoices';
import { addMonths, monthOf } from './months';
import { computeSettlement } from './split';

export type HealthKind =
  | 'duplicate_id'
  | 'missing_category'
  | 'account_and_card'
  | 'invoice_mismatch'
  | 'installment_count'
  | 'fund_without_goal'
  | 'month_without_income'
  | 'closed_with_pending_settlement'
  | 'overdue';

export interface HealthIssue {
  kind: HealthKind;
  message: string;
  transactionId?: string;
  /** Present when the app can repair it with one tap. */
  fix?: { invoiceMonth: string };
  month?: string;
}

/** The checks ported from the spreadsheet (spec 6.7), run over one snapshot of the data. */
export function checkHealth(data: Data, now: string): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const { transactions: rows, cards, categories, goals, accounts } = data;
  const seen = new Set<string>();
  const categoryIds = new Set(categories.map((c) => c.id));
  const groups = new Map<string, Data['transactions']>();

  for (const t of rows) {
    const label = t.description || t.date;
    if (seen.has(t.id))
      issues.push({
        kind: 'duplicate_id',
        message: `Id repetido em "${label}".`,
        transactionId: t.id,
      });
    seen.add(t.id);
    if (t.categoryId && !categoryIds.has(t.categoryId)) {
      issues.push({
        kind: 'missing_category',
        message: `"${label}" aponta para uma categoria que não existe.`,
        transactionId: t.id,
      });
    }
    if (t.accountId && t.cardId) {
      issues.push({
        kind: 'account_and_card',
        message: `"${label}" tem conta e cartão ao mesmo tempo.`,
        transactionId: t.id,
      });
    }
    if (t.cardId && !t.installmentGroupId) {
      const card = cards.find((c) => c.id === t.cardId);
      if (card) {
        const expected = invoiceMonthFor(t.date, card);
        if (t.invoiceMonth !== expected) {
          issues.push({
            kind: 'invoice_mismatch',
            message: `"${label}" está na fatura ${t.invoiceMonth ?? '(sem fatura)'}, mas a data indica ${expected}.`,
            transactionId: t.id,
            fix: { invoiceMonth: expected },
          });
        }
      }
    }
    if (t.installmentGroupId) {
      const list = groups.get(t.installmentGroupId) ?? [];
      list.push(t);
      groups.set(t.installmentGroupId, list);
    }
    if (t.goalId && !goals.some((g) => g.id === t.goalId)) {
      issues.push({
        kind: 'fund_without_goal',
        message: `"${label}" está ligado a um sonho que não existe.`,
        transactionId: t.id,
      });
    }
    if (t.kind === 'expense' && !t.goalId && accounts.length > 0 && t.accountId) {
      const fund = goals.find((g) => g.accountId === t.accountId);
      if (fund) {
        issues.push({
          kind: 'fund_without_goal',
          message: `"${label}" saiu da conta do sonho ${fund.name} sem estar ligada a ele.`,
          transactionId: t.id,
        });
      }
    }
    if (t.kind === 'expense' && t.status === 'pending' && !t.cardId && t.date < now) {
      issues.push({
        kind: 'overdue',
        message: `"${label}" venceu em ${t.date} e segue pendente.`,
        transactionId: t.id,
      });
    }
  }

  for (const list of groups.values()) {
    const total = list[0]!.installmentTotal;
    if (total !== null && list.length !== total) {
      issues.push({
        kind: 'installment_count',
        message: `"${list[0]!.description}" deveria ter ${total} parcelas e tem ${list.length}.`,
        transactionId: list[0]!.id,
      });
    }
  }

  const ctx = { ...data, household: data.household };
  const thisMonth = monthOf(now);
  const spendingMonths = new Set(
    rows.filter((t) => t.kind === 'expense').map((t) => t.competenceMonth),
  );
  for (const month of spendingMonths) {
    if (month > thisMonth || month < addMonths(thisMonth, -12)) continue;
    for (const member of data.members) {
      const has = data.incomes.some((i) => i.memberId === member.id && i.competenceMonth === month);
      if (!has) {
        issues.push({
          kind: 'month_without_income',
          message: `${month} tem gastos, mas nenhuma renda de ${member.name}.`,
          month,
        });
      }
    }
  }
  for (const close of data.closes) {
    if (close.reopenedAt) continue;
    if (computeSettlement(ctx, close.month).transfer) {
      issues.push({
        kind: 'closed_with_pending_settlement',
        message: `${close.month} está fechado com acerto pendente.`,
        month: close.month,
      });
    }
  }
  return issues;
}
