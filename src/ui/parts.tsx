import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import type { ReactNode } from 'react';
import { isValidElement, useState } from 'react';
import { formatBRL, parseAmount } from '../domain/money';

export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      {(title || action) && (
        <div className="section-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ProgressBar({
  value,
  tone = 'primary',
  label,
}: {
  value: number;
  tone?: 'primary' | 'income' | 'warning' | 'expense';
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span className={`progress-fill fill-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DualProgress({
  first,
  second,
  label,
}: {
  first: number;
  second: number;
  label?: string;
}) {
  const a = Math.round(Math.min(1, Math.max(0, first)) * 100);
  const b = Math.round(Math.min(1 - a / 100, Math.max(0, second)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={a + b} aria-label={label}>
      <span className="progress-fill fill-primary" style={{ width: `${a}%` }} />
      <span className="progress-fill fill-primary-soft" style={{ width: `${b}%`, left: `${a}%` }} />
    </div>
  );
}

export function Skeleton({ height = 120 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-hidden="true" />;
}

/** Bottom sheet with detents, a grab handle and drag to dismiss (spec 7.4). */
export function Sheet({
  isOpen,
  onClose,
  title,
  onSave,
  saveLabel = 'Salvar',
  breakpoints = [0, 0.5, 0.92],
  initial = 0.92,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onSave?: () => void;
  saveLabel?: string;
  breakpoints?: number[];
  initial?: number;
  children: ReactNode;
}) {
  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onClose}
      breakpoints={breakpoints}
      initialBreakpoint={initial}
      handle
    >
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onClose}>Cancelar</IonButton>
          </IonButtons>
          <IonTitle>{title}</IonTitle>
          {onSave && (
            <IonButtons slot="end">
              <IonButton strong onClick={onSave}>
                {saveLabel}
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">{children}</IonContent>
    </IonModal>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const body = (
    <>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </>
  );
  // A <label> forwards taps to its first control, so around chips or buttons it would press one of
  // them whenever someone touched the caption. It only wraps a single native control.
  const isNativeControl =
    isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type as string);
  if (isNativeControl) return <label className="field">{body}</label>;
  return (
    <div className="field" role="group" aria-label={label}>
      {body}
    </div>
  );
}

/** Bank-style amount input for secondary forms; the main form uses the full keypad. */
export function MoneyField({
  value,
  onChange,
  allowNegative = false,
  ariaLabel,
}: {
  value: number;
  onChange: (cents: number) => void;
  allowNegative?: boolean;
  ariaLabel?: string;
}) {
  // Zero has no sign, so the choice has to be remembered until digits arrive.
  const [chosenNegative, setNegative] = useState(value < 0);
  const negative = value !== 0 ? value < 0 : chosenNegative;
  const absolute = Math.abs(value);
  return (
    <span className="money-field">
      {allowNegative && (
        <button
          type="button"
          className="chip"
          aria-label={negative ? 'Valor negativo' : 'Valor positivo'}
          onClick={() => {
            const next = !negative;
            setNegative(next);
            onChange(next ? -absolute : absolute);
          }}
        >
          {negative ? '−' : '+'}
        </button>
      )}
      <input
        className="input tabular"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={formatBRL(absolute)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          const cents = Number(digits.slice(0, 13) || '0');
          onChange(negative ? -cents : cents);
        }}
      />
    </span>
  );
}

export function parseCentsInput(text: string): number {
  return Math.abs(parseAmount(text) ?? 0);
}

export function ChoiceChips<T extends string | null>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`chip ${o.value === value ? 'chip-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
