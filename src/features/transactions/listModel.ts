import type { Data } from '../../db/DataContext';
import { normalizeText } from '../../domain/summaries';
import type { Transaction, Transfer } from '../../schemas/entities';
import type { TxFilters } from '../../ui/uiStore';

export interface ListItem {
  id: string;
  date: string;
  signedCents: number;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  status: 'paid' | 'pending';
  tone: 'income' | 'expense' | 'transfer';
  transaction?: Transaction;
  transfer?: Transfer;
}

const TRANSFER_TITLE: Record<Transfer['kind'], string> = {
  transfer: 'Transferência',
  invoice_payment: 'Pagamento de fatura',
  settlement: 'Acerto entre vocês',
  joint_deposit: 'Depósito na conjunta',
  goal_contribution: 'Aporte em sonho',
};

function names(data: Data) {
  return {
    account: new Map(data.accounts.map((a) => [a.id, a.name])),
    card: new Map(data.cards.map((c) => [c.id, c.name])),
    category: new Map(data.categories.map((c) => [c.id, c])),
  };
}

export function transferTitle(t: Transfer): string {
  return TRANSFER_TITLE[t.kind];
}

export function buildListItems(data: Data, month: string, filters: TxFilters): ListItem[] {
  const n = names(data);
  const q = normalizeText(filters.query);
  const out: ListItem[] = [];
  const searching = q.length > 0;
  const { deviceMemberIndex, showOtherPersonal } = data.settings;
  const hiddenRule = showOtherPersonal ? null : deviceMemberIndex === 0 ? 'memberB' : 'memberA';

  if (filters.kind !== 'transfer') {
    for (const t of data.transactions) {
      // A search looks across all months: that is usually what someone hunting a charge wants.
      if (!searching && t.competenceMonth !== month) continue;
      if (hiddenRule && t.splitRule === hiddenRule) continue;
      if (filters.kind !== 'all' && t.kind !== filters.kind) continue;
      if (filters.accountId && t.accountId !== filters.accountId) continue;
      if (filters.cardId && t.cardId !== filters.cardId) continue;
      if (filters.categoryId) {
        const c = t.categoryId ? n.category.get(t.categoryId) : undefined;
        if (t.categoryId !== filters.categoryId && c?.parentId !== filters.categoryId) continue;
      }
      if (filters.tagId && !t.tagIds.includes(filters.tagId)) continue;
      if (filters.status !== 'all' && t.status !== filters.status) continue;
      if (filters.payerMemberId && t.payerMemberId !== filters.payerMemberId) {
        const owner = t.cardId
          ? data.cards.find((c) => c.id === t.cardId)?.ownerMemberId
          : data.accounts.find((a) => a.id === t.accountId)?.ownerMemberId;
        if (owner !== filters.payerMemberId) continue;
      }
      if (filters.splitRule && t.splitRule !== filters.splitRule) continue;
      if (searching && !normalizeText(`${t.description} ${t.notes}`).includes(q)) continue;

      const category = t.categoryId ? n.category.get(t.categoryId) : undefined;
      const where = t.cardId ? n.card.get(t.cardId) : t.accountId ? n.account.get(t.accountId) : '';
      const parts = [category?.name ?? 'Sem categoria', where];
      if (t.installmentNumber) parts.push(`${t.installmentNumber}/${t.installmentTotal}`);
      out.push({
        id: t.id,
        date: t.date,
        signedCents: t.kind === 'income' ? t.amountCents : -t.amountCents,
        title: t.description || category?.name || 'Sem descrição',
        subtitle: parts.filter(Boolean).join(' · '),
        icon: category?.icon ?? 'question',
        color: category?.color ?? '#8E8A86',
        status: t.status,
        tone: t.kind === 'income' ? 'income' : 'expense',
        transaction: t,
      });
    }
  }

  const transactionOnly =
    filters.cardId ||
    filters.categoryId ||
    filters.tagId ||
    filters.payerMemberId ||
    filters.splitRule ||
    filters.kind === 'income' ||
    filters.kind === 'expense';
  if (!transactionOnly) {
    for (const t of data.transfers) {
      if (!searching && t.competenceMonth !== month) continue;
      if (filters.status !== 'all' && t.status !== filters.status) continue;
      if (
        filters.accountId &&
        t.fromAccountId !== filters.accountId &&
        t.toAccountId !== filters.accountId
      ) {
        continue;
      }
      const to = t.toCardId
        ? n.card.get(t.toCardId)
        : t.toAccountId
          ? n.account.get(t.toAccountId)
          : '';
      const subtitle = `${n.account.get(t.fromAccountId) ?? ''} → ${to ?? ''}`;
      if (searching && !normalizeText(`${transferTitle(t)} ${subtitle} ${t.notes}`).includes(q))
        continue;
      out.push({
        id: t.id,
        date: t.date,
        // Moving money between own accounts is neither gain nor loss.
        signedCents: 0,
        title: transferTitle(t),
        subtitle,
        icon: 'repeat',
        color: '#3E63DD',
        status: t.status,
        tone: 'transfer',
        transfer: t,
      });
    }
  }
  return out;
}

export function activeFilterCount(filters: TxFilters): number {
  return [
    filters.kind !== 'all',
    filters.accountId,
    filters.cardId,
    filters.categoryId,
    filters.tagId,
    filters.status !== 'all',
    filters.payerMemberId,
    filters.splitRule,
  ].filter(Boolean).length;
}
