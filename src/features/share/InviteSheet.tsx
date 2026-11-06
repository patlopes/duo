import { ShareNetworkIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useData } from '../../db/DataContext';
import { copyText } from '../../io/share';
import { Field, Sheet } from '../../ui/parts';
import { useToast } from '../../ui/useToast';
import { GoogleButton } from '../google/GoogleButton';
import { inviteLinkFor, inviteToSheet } from '../google/googleSheets';
import { currentToken } from '../google/sheetSession';

/** The Gmail says who may open the file; the link is how they get there. */
export function InviteSheet({ onClose }: { onClose: () => void }) {
  const { settings, members } = useData();
  const presentToast = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState(() => currentToken());
  const other = members[settings.deviceMemberIndex === 0 ? 1 : 0];
  const link = inviteLinkFor(settings.googleSheetId ?? '');

  const invite = async () => {
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError('Confira esse e-mail.');
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await inviteToSheet(token, settings.googleSheetId!, address);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para convidar agora.');
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    const text = `Vamos usar as mesmas contas no Meu Bem? ${link}`;
    try {
      if (navigator.share) return await navigator.share({ text });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
    const copied = await copyText(text);
    void presentToast({
      message: copied ? 'Link copiado.' : link,
      duration: copied ? 2000 : 6000,
      position: 'top',
    });
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={`Convidar ${other.name}`}
      breakpoints={[0, 0.7, 0.92]}
      initial={0.7}
    >
      {!token ? (
        <>
          <p className="subhead">Entre com o Google para enviar o convite.</p>
          <GoogleButton onDone={() => setToken(currentToken())} />
        </>
      ) : !sent ? (
        <div className="stack">
          <Field label={`Qual é o Gmail de ${other.name}?`}>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoCapitalize="off"
              autoComplete="off"
              aria-label="Gmail de quem vai dividir"
              placeholder="nome@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <span className="small muted">
            Só esse Gmail consegue abrir os dados de vocês, mesmo que o link vá parar em outro
            lugar.
          </span>
          {error && (
            <p className="tone-expense small" style={{ margin: 0 }}>
              {error}
            </p>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={busy || !email.trim()}
            onClick={() => void invite()}
          >
            {busy ? 'Enviando…' : 'Enviar convite'}
          </button>
        </div>
      ) : (
        <div className="stack">
          <strong>Convite enviado para {email.trim()}</strong>
          <span className="subhead">
            O link também foi por e-mail. Para ser mais rápido, mandem por mensagem.
          </span>
          <button type="button" className="primary-button" onClick={() => void shareLink()}>
            <ShareNetworkIcon size={20} weight="bold" aria-hidden="true" />
            &nbsp;Enviar o link
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Pronto
          </button>
        </div>
      )}
    </Sheet>
  );
}
