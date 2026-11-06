import { useMemo } from 'react';
import { useData } from '../../db/DataContext';
import { updateTransaction } from '../../db/ops';
import { checkHealth } from '../../domain/health';
import { today } from '../../domain/months';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { useUi } from '../../ui/uiStore';

export function HealthList() {
  const data = useData();
  const openForm = useUi((s) => s.openForm);
  const issues = useMemo(() => checkHealth(data, today()), [data]);

  if (issues.length === 0) {
    return <p className="empty-note">Tudo certo com os dados de vocês ✨</p>;
  }
  return (
    <div className="card-list">
      {issues.slice(0, 100).map((issue, i) => {
        const row = issue.transactionId
          ? data.transactions.find((t) => t.id === issue.transactionId)
          : undefined;
        return (
          <div key={`${issue.kind}-${i}`} className="row">
            <span className="row-main subhead" style={{ lineHeight: 1.35 }}>
              {issue.message}
            </span>
            {issue.fix && row ? (
              <button
                type="button"
                className="chip"
                onClick={() =>
                  void updateTransaction(row.id, { invoiceMonth: issue.fix!.invoiceMonth })
                }
              >
                Corrigir
              </button>
            ) : row ? (
              <button
                type="button"
                className="chip"
                onClick={() => openForm({ type: row.cardId ? 'card' : row.kind, transaction: row })}
              >
                Ver
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function HealthPage() {
  return (
    <LargeTitlePage title="Saúde dos dados" backHref="/tabs/more">
      <div className="page-pad">
        <HealthList />
      </div>
    </LargeTitlePage>
  );
}
