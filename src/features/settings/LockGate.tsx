import { useIonAlert } from '@ionic/react';
import { useEffect, useRef, useState } from 'react';
import { LockIcon } from '@phosphor-icons/react';
import { useData } from '../../db/DataContext';
import { updateSettings } from '../../db/ops';
import { AmountKeypadDigits } from './PinPad';
import { hashPin, verifyFaceId } from './lock';

const RELOCK_AFTER_MS = 60_000;

export default function LockGate() {
  const { settings } = useData();
  const [presentAlert] = useIonAlert();
  const [locked, setLocked] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS) {
        setPin('');
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!locked || !settings.lockHash || !settings.lockSalt) return null;

  const press = async (digit: string) => {
    setError('');
    if (digit === 'back') {
      setPin(pin.slice(0, -1));
      return;
    }
    if (pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    if (next.length >= 4 && (await hashPin(next, settings.lockSalt!)) === settings.lockHash) {
      setLocked(false);
      setPin('');
    } else if (next.length === 6) {
      setError('PIN incorreto');
      setPin('');
    }
  };

  const faceId = async () => {
    if (settings.lockCredentialId && (await verifyFaceId(settings.lockCredentialId)))
      setLocked(false);
  };

  // A forgotten PIN must never cost the data: this is a screen lock, not encryption (spec 2.12).
  const forgot = () =>
    void presentAlert({
      header: 'Esqueceu o PIN?',
      message:
        'O PIN é uma trava de tela, não uma criptografia. Vocês podem remover a trava e os dados continuam aqui.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover trava',
          handler: () =>
            void updateSettings({
              lockEnabled: false,
              lockHash: null,
              lockSalt: null,
              lockCredentialId: null,
            }),
        },
      ],
    });

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label="App bloqueado">
      <div style={{ color: 'var(--color-primary)' }}>
        <LockIcon size={40} aria-hidden="true" />
      </div>
      <strong>Digite o PIN</strong>
      <div className="pin-dots" aria-label={`${pin.length} dígitos digitados`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`pin-dot ${i < pin.length ? 'pin-dot-on' : ''}`} />
        ))}
      </div>
      {error && <span className="tone-expense small">{error}</span>}
      <AmountKeypadDigits onPress={(d) => void press(d)} />
      {settings.lockCredentialId && (
        <button type="button" className="secondary-button" onClick={() => void faceId()}>
          Usar Face ID
        </button>
      )}
      <button type="button" className="link-button" onClick={forgot}>
        Esqueci o PIN
      </button>
    </div>
  );
}
