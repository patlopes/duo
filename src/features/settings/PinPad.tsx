import { BackspaceIcon } from '@phosphor-icons/react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

export function AmountKeypadDigits({ onPress }: { onPress: (key: string) => void }) {
  return (
    <div className="keypad" role="group" aria-label="Teclado do PIN">
      {KEYS.map((key, i) =>
        key === '' ? (
          <span key={i} />
        ) : (
          <button
            key={key}
            type="button"
            className="keypad-key pressable"
            aria-label={key === 'back' ? 'Apagar' : key}
            onClick={() => onPress(key)}
          >
            {key === 'back' ? <BackspaceIcon size={26} aria-hidden="true" /> : key}
          </button>
        ),
      )}
    </div>
  );
}
