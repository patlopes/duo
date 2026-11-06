import { IonModal } from '@ionic/react';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useRef, useState, type TouchEvent } from 'react';
import { addMonths, monthLabel, monthOf, monthShort, today } from '../domain/months';
import { useUi } from './uiStore';

/** Horizontal swipe changes month. Vertical movement is left alone, so the page still scrolls. */
export function useMonthSwipe() {
  const month = useUi((s) => s.month);
  const setMonth = useUi((s) => s.setMonth);
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      // The left edge belongs to iOS swipe-back.
      start.current = t && t.clientX > 24 ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!start.current || !t) return;
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
        setMonth(addMonths(month, dx < 0 ? 1 : -1));
      }
    },
  };
}

export function MonthPicker() {
  const month = useUi((s) => s.month);
  const setMonth = useUi((s) => s.setMonth);
  const [gridOpen, setGridOpen] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const current = monthOf(today());

  return (
    <div className="month-picker">
      <button
        type="button"
        className="icon-button"
        aria-label="Mês anterior"
        onClick={() => setMonth(addMonths(month, -1))}
      >
        <CaretLeftIcon size={20} weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="month-picker-label"
        onClick={() => {
          setYear(Number(month.slice(0, 4)));
          setGridOpen(true);
        }}
      >
        {monthLabel(month)}
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Próximo mês"
        onClick={() => setMonth(addMonths(month, 1))}
      >
        <CaretRightIcon size={20} weight="bold" aria-hidden="true" />
      </button>
      {month !== current && (
        <button type="button" className="chip" onClick={() => setMonth(current)}>
          Hoje
        </button>
      )}

      <IonModal
        isOpen={gridOpen}
        onDidDismiss={() => setGridOpen(false)}
        breakpoints={[0, 0.5]}
        initialBreakpoint={0.5}
        handle
      >
        <div className="month-grid-wrap">
          <div className="month-picker">
            <button
              type="button"
              className="icon-button"
              aria-label="Ano anterior"
              onClick={() => setYear(year - 1)}
            >
              <CaretLeftIcon size={20} weight="bold" aria-hidden="true" />
            </button>
            <strong className="tabular">{year}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Próximo ano"
              onClick={() => setYear(year + 1)}
            >
              <CaretRightIcon size={20} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <div className="month-grid">
            {Array.from({ length: 12 }, (_, i) => {
              const value = `${year}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button
                  key={value}
                  type="button"
                  className={`chip ${value === month ? 'chip-on' : ''}`}
                  onClick={() => {
                    setMonth(value);
                    setGridOpen(false);
                  }}
                >
                  {monthShort(value)}
                </button>
              );
            })}
          </div>
        </div>
      </IonModal>
    </div>
  );
}
