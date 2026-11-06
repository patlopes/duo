import { BackspaceIcon } from '@phosphor-icons/react';
import { pressKeypad, type KeypadKey } from '../domain/money';

const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'];

/** Avoids the iOS keyboard and its zoom, and needs no decimal key: 1, 2, 3, 4 reads R$ 12,34. */
export function AmountKeypad({
  cents,
  onChange,
}: {
  cents: number;
  onChange: (cents: number) => void;
}) {
  return (
    <div className="keypad" role="group" aria-label="Teclado de valor">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="keypad-key pressable"
          aria-label={key === 'back' ? 'Apagar' : key}
          onClick={() => onChange(pressKeypad(cents, key))}
        >
          {key === 'back' ? <BackspaceIcon size={26} aria-hidden="true" /> : key}
        </button>
      ))}
    </div>
  );
}
