import { GoogleLogoIcon } from '@phosphor-icons/react';
import type { ConnectResult } from '../../io/sheetSync';
import { useGoogleConnect } from './useGoogleConnect';

export function GoogleButton({
  onDone,
  secondary = false,
  codeHint = false,
}: {
  onDone?: (result: ConnectResult) => void;
  secondary?: boolean;
  /** For first sign-ins, when Google is most likely to send a code to the e-mail. */
  codeHint?: boolean;
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
      {codeHint && !error && (
        <p className="small muted" style={{ margin: 'var(--space-2) 0 0', textAlign: 'center' }}>
          Se o Google pedir um código, não feche a janela dele: veja o e-mail em outra aba ou app.
        </p>
      )}
      {error && (
        <p className="tone-expense small" style={{ margin: 'var(--space-2) 0 0' }}>
          {error}
        </p>
      )}
    </>
  );
}
