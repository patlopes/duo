import { useEffect, useRef, useState } from 'react';
import { useData } from '../db/DataContext';
import { formatBRL } from '../domain/money';

type Tone = 'income' | 'expense' | 'transfer' | 'warning' | 'muted';

interface MoneyTextProps {
  cents: number;
  tone?: Tone;
  /** Shows "+" on positive values. */
  plus?: boolean;
  animate?: boolean;
  className?: string;
}

const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts toward a new value, only when it changes (spec 7.4). */
function useCountUp(target: number, enabled: boolean): number {
  const [shown, setShown] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    const from = previous.current;
    previous.current = target;
    if (!enabled || from === target || prefersReducedMotion()) {
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(at) {
      const t = Math.min(1, (at - start) / 300);
      setShown(Math.round(from + (target - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return enabled ? shown : target;
}

export function MoneyText({ cents, tone, plus, animate = false, className = '' }: MoneyTextProps) {
  const { settings } = useData();
  const shown = useCountUp(cents, animate);
  const classes = `tabular ${tone ? `tone-${tone}` : ''} ${className}`;

  if (settings.hideValues) {
    return (
      <span className={classes} role="text" aria-label="Valor oculto">
        R$ ••••
      </span>
    );
  }
  return (
    <span className={classes}>
      {plus && shown > 0 ? '+' : ''}
      {formatBRL(shown)}
    </span>
  );
}
