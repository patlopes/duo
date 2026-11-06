import { useMemo, useState } from 'react';
import { useData } from '../../db/DataContext';
import { formatBRLRound } from '../../domain/money';
import { dayNumber, monthLabel, today } from '../../domain/months';
import { fixedBills, futureMonths, type FutureMonth } from '../../domain/plan';
import { IconBubble } from '../../ui/icons';
import { Mascot } from '../../ui/Mascot';
import { MoneyText } from '../../ui/MoneyText';
import { Sheet } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { planDataOf } from '../home/HomePage';

export function FixedView() {
  const data = useData();
  const openBill = useUi((s) => s.openBill);
  const now = today();
  const list = useMemo(() => fixedBills(data.recurrences, data.transactions, now), [data, now]);
  const total = list.reduce(
    (sum, item) => sum + (item.next?.amountCents ?? item.recurrence.template.amountCents),
    0,
  );

  return (
    <div className="page-pad">
      <div className="hero rise" style={{ marginTop: 'var(--space-3)' }}>
        <span className="hero-label">Quando o mês começa, vocês têm</span>
        <MoneyText cents={total} animate className="hero-amount" />
        <span className="hero-label">em contas fixas</span>
      </div>
      <button
        type="button"
        className="primary-button rise"
        style={{ marginTop: 'var(--space-3)', ['--i' as string]: 1 }}
        onClick={() => openBill({ mode: 'recurring' })}
      >
        Adicionar conta fixa
      </button>
      {list.length === 0 ? (
        <div
          className="card empty-hero rise"
          style={{ marginTop: 'var(--space-3)', ['--i' as string]: 2 }}
        >
          {data.settings.mascots && <Mascot animal="giraffe" pose="wink" idle />}
          <strong>Nenhuma conta fixa ainda</strong>
          <span className="muted subhead">
            Coloquem uma vez e ela aparece sozinha em todos os meses.
          </span>
        </div>
      ) : (
        <div
          className="card-list rise"
          style={{ marginTop: 'var(--space-3)', ['--i' as string]: 2 }}
        >
          {list.map(({ recurrence, next }) => {
            const category = data.categories.find((c) => c.id === recurrence.template.categoryId);
            const editable = next;
            return (
              <button
                key={recurrence.id}
                type="button"
                className="row"
                disabled={!editable}
                onClick={() => editable && openBill({ transaction: editable })}
              >
                <IconBubble
                  name={category?.icon ?? 'receipt'}
                  color={category?.color ?? '#6E2F6B'}
                />
                <span className="row-main">
                  <span className="row-title">{recurrence.template.description}</span>
                  <span className="row-sub">
                    Todo dia {next ? dayNumber(next.date) : dayNumber(recurrence.startDate)}
                    {category ? ` · ${category.name}` : ''}
                  </span>
                </span>
                <MoneyText
                  className="row-end"
                  cents={next?.amountCents ?? recurrence.template.amountCents}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FutureView() {
  const data = useData();
  const openBill = useUi((s) => s.openBill);
  const setMonth = useUi((s) => s.setMonth);
  const now = today();
  const months = useMemo(() => futureMonths(planDataOf(data), now, 12), [data, now]);
  const [picked, setPicked] = useState<FutureMonth | null>(null);
  const top = Math.max(...months.map((m) => m.totalCents), 1);
  const hidden = data.settings.hideValues;
  const name = (i: number) => data.members[i]!.name;

  return (
    <div className="page-pad">
      <button
        type="button"
        className="primary-button rise"
        style={{ marginTop: 'var(--space-3)' }}
        onClick={() => openBill({ mode: 'once' })}
      >
        Adicionar conta ou compra futura
      </button>
      <div className="card-list rise" style={{ marginTop: 'var(--space-3)', ['--i' as string]: 1 }}>
        {months.map((m) => (
          <button key={m.month} type="button" className="row" onClick={() => setPicked(m)}>
            <span className="row-main">
              <span className="row-title" style={{ display: 'block' }}>
                {monthLabel(m.month)}
              </span>
              <span className="row-sub">
                {m.oneOff.length > 0
                  ? `${m.oneOff.length} fora do comum: ${m.oneOff.map((t) => t.description).join(', ')}`
                  : 'Só as contas fixas'}
              </span>
              <span className="progress" style={{ display: 'block' }}>
                <span
                  className="progress-fill fill-primary"
                  style={{ width: `${(m.totalCents / top) * 100}%` }}
                />
              </span>
            </span>
            <MoneyText className="row-end" cents={m.totalCents} />
          </button>
        ))}
      </div>
      {picked && (
        <Sheet
          isOpen
          onClose={() => setPicked(null)}
          title={monthLabel(picked.month)}
          breakpoints={[0, 0.6, 0.92]}
          initial={0.6}
        >
          <div className="two-cols">
            <div>
              <span className="stat-label">Fixas</span>
              <MoneyText cents={picked.fixedCents} className="stat-value" />
            </div>
            <div>
              <span className="stat-label">Fora do comum</span>
              <MoneyText cents={picked.totalCents - picked.fixedCents} className="stat-value" />
            </div>
          </div>
          {!hidden && (
            <p className="other-option">
              {name(0)} paga {formatBRLRound(picked.share[0])} e {name(1)},{' '}
              {formatBRLRound(picked.share[1])}.
            </p>
          )}
          <div className="card-list" style={{ marginTop: 'var(--space-2)' }}>
            {picked.oneOff.map((t) => (
              <button
                key={t.id}
                type="button"
                className="row"
                onClick={() => {
                  setPicked(null);
                  openBill({ transaction: t });
                }}
              >
                <span className="row-main">
                  <span className="row-title">{t.description}</span>
                </span>
                <MoneyText className="row-end" cents={t.amountCents} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="secondary-button"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => {
              setMonth(picked.month);
              setPicked(null);
            }}
          >
            Ver {monthLabel(picked.month)} no Início
          </button>
        </Sheet>
      )}
    </div>
  );
}
