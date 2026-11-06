import { useMemo } from 'react';
import { useData } from '../../db/DataContext';
import { monthLabel } from '../../domain/months';
import { categorySlices, monthTotals, topSlices } from '../../domain/summaries';
import { IconBubble } from '../../ui/icons';
import { MoneyText } from '../../ui/MoneyText';
import { Sheet } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';

/** What opens when a month is tapped on a chart. */
export function MonthSummarySheet({ month, onClose }: { month: string; onClose: () => void }) {
  const { transactions, categories } = useData();
  const setMonth = useUi((s) => s.setMonth);
  const totals = useMemo(() => monthTotals(transactions, month), [transactions, month]);
  const slices = useMemo(
    () => topSlices(categorySlices(transactions, categories, month)),
    [transactions, categories, month],
  );
  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={monthLabel(month)}
      breakpoints={[0, 0.7, 0.92]}
      initial={0.7}
    >
      <div className="two-cols">
        <div>
          <span className="stat-label">Entradas</span>
          <MoneyText cents={totals.incomeCents} tone="income" className="stat-value" />
        </div>
        <div>
          <span className="stat-label">Saídas</span>
          <MoneyText cents={totals.expenseCents} tone="expense" className="stat-value" />
        </div>
      </div>
      <h3 className="sheet-label">Para onde foi</h3>
      <div className="card-list">
        {slices.length === 0 && <p className="empty-note">Sem despesas neste mês.</p>}
        {slices.map((s) => (
          <div key={s.name} className="row">
            <IconBubble name={s.icon} color={s.color} size={32} />
            <span className="row-main">
              <span className="row-title">{s.name}</span>
              <span className="row-sub tabular">{Math.round(s.share * 100)}%</span>
            </span>
            <MoneyText className="row-end" cents={s.cents} />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="secondary-button"
        style={{ marginTop: 'var(--space-3)' }}
        onClick={() => {
          setMonth(month);
          onClose();
        }}
      >
        Ir para este mês
      </button>
    </Sheet>
  );
}
