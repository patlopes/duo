import { GoogleLogoIcon } from '@phosphor-icons/react';
import type { ConnectResult } from '../../io/sheetSync';
import { useGoogleConnect } from './useGoogleConnect';

export function GoogleButton({
  onDone,
  secondary = false,
}: {
  onDone?: (result: ConnectResult) => void;
  secondary?: boolean;
}) {
  const { ready, busy, error, connect } = useGoogleConnect();
  return (
    <>
      <button
        type="button"
        className={secondary ? 'secondary-button' : 'primary-button'}
        disabled={!ready || busy}
        onClick={() => connect(onDone)}
      >
        <GoogleLogoIcon size={20} weight="bold" aria-hidden="true" />
        &nbsp;{busy ? 'Entrando…' : 'Entrar com Google'}
      </button>
      {error && (
        <p className="tone-expense small" style={{ margin: 'var(--space-2) 0 0' }}>
          {error}
        </p>
      )}
    </>
  );
}
