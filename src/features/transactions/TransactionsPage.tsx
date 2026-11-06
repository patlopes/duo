import { ReceiptIcon } from '@phosphor-icons/react';
import { EmptyState } from '../../ui/EmptyState';
import { LargeTitlePage } from '../../ui/LargeTitlePage';

export function TransactionsPage() {
  return (
    <LargeTitlePage title="Lançamentos">
      <EmptyState
        icon={<ReceiptIcon />}
        title="Ainda sem lançamentos"
        description="A lista, a busca e os filtros chegam na próxima fase."
      />
    </LargeTitlePage>
  );
}
