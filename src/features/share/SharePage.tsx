import { ShareNetworkIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useData } from '../../db/DataContext';
import { updateSettings } from '../../db/ops';
import {
  applySync,
  buildSyncPayload,
  decodePayload,
  encodePayload,
  previewSync,
  type SyncPayload,
  type SyncPreview,
} from '../../io/coupleSync';
import { copyText } from '../../io/share';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { Mascot } from '../../ui/Mascot';
import { ChoiceChips, Field, Section } from '../../ui/parts';
import { useToast } from '../../ui/useToast';
import { SheetSection } from './SheetSection';

/**
 * No server, on purpose: nothing can go offline or start charging. One phone sends a message, the
 * other pastes it, and for each row the most recent edit wins.
 */
export default function SharePage() {
  const { members, settings } = useData();
  const presentToast = useToast();
  const [pasted, setPasted] = useState('');
  const [incoming, setIncoming] = useState<{ payload: SyncPayload; preview: SyncPreview } | null>(
    null,
  );
  const [identity, setIdentity] = useState<'0' | '1'>(
    String(settings.deviceMemberIndex) as '0' | '1',
  );
  const [error, setError] = useState('');
  const [fallback, setFallback] = useState('');
  const [showMessages, setShowMessages] = useState(false);

  const toast = (message: string) =>
    void presentToast({ message, duration: 2600, position: 'top' });
  const other = members[settings.deviceMemberIndex === 0 ? 1 : 0];
  const changedSinceSend =
    !!settings.lastChangeAt &&
    (!settings.lastSyncSentAt || settings.lastChangeAt > settings.lastSyncSentAt);

  const send = async () => {
    const code = await encodePayload(await buildSyncPayload());
    const text = `Atualização do Meu Bem. Copie esta mensagem inteira e cole no app, em Mais → Compartilhar:\n\n${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        await updateSettings({ lastSyncSentAt: new Date().toISOString() });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
    if (await copyText(text)) {
      await updateSettings({ lastSyncSentAt: new Date().toISOString() });
      toast('Copiado. Agora é só colar na conversa de vocês.');
    } else {
      setFallback(text);
    }
  };

  const read = async () => {
    setError('');
    try {
      const payload = await decodePayload(pasted);
      setIncoming({ payload, preview: await previewSync(payload) });
      // If the sender was one person, this phone is the other: a good first guess.
      setIdentity(payload.fromMemberIndex === 0 ? '1' : '0');
    } catch (e) {
      setIncoming(null);
      setError(e instanceof Error ? e.message : 'Não consegui ler essa mensagem.');
    }
  };

  const apply = async () => {
    if (!incoming) return;
    try {
      const result = await applySync(incoming.payload, Number(identity) as 0 | 1);
      setIncoming(null);
      setPasted('');
      toast(
        result.applied > 0 ? `Pronto: ${result.applied} novidades.` : 'Vocês já estavam em dia.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível aplicar.');
    }
  };

  return (
    <LargeTitlePage title="Compartilhar" backHref="/tabs/more">
      <div className="page-pad">
        <div className="card empty-hero rise">
          {settings.mascots && (
            <div className="mascot-onboarding" style={{ marginBottom: 0 }}>
              <Mascot animal="giraffe" size={84} idle />
              <Mascot animal="monkey" size={76} idle delay={0.7} />
            </div>
          )}
          <strong>As contas de vocês, nos dois celulares</strong>
          <span className="muted subhead">
            Os mesmos dados nos dois celulares e no computador, atualizando sozinhos.
          </span>
        </div>

        <SheetSection />

        <button
          type="button"
          className="link-button"
          style={{ margin: 'var(--space-5) auto 0', display: 'block' }}
          aria-expanded={showMessages}
          onClick={() => setShowMessages(!showMessages)}
        >
          Prefiro sem conta Google: trocar por mensagem
        </button>
        {showMessages && (
          <>
            <Section title="1. Enviar">
              <div className="card stack rise" style={{ ['--i' as string]: 1 }}>
                <button type="button" className="primary-button" onClick={() => void send()}>
                  <ShareNetworkIcon size={20} weight="bold" aria-hidden="true" />
                  &nbsp;Enviar para {other.name}
                </button>
                <span className="small muted">
                  {changedSinceSend
                    ? 'Você mudou coisas desde o último envio.'
                    : settings.lastSyncSentAt
                      ? `Último envio: ${new Date(settings.lastSyncSentAt).toLocaleString('pt-BR')}`
                      : 'Nada enviado ainda.'}{' '}
                  Gastos individuais não são enviados.
                </span>
                {fallback && (
                  <textarea
                    className="textarea share-code"
                    readOnly
                    aria-label="Mensagem para enviar"
                    value={fallback}
                    onFocus={(e) => e.target.select()}
                  />
                )}
              </div>
            </Section>

            <Section title="2. Receber">
              <div className="card stack rise" style={{ ['--i' as string]: 2 }}>
                <textarea
                  className="textarea share-code"
                  aria-label="Mensagem recebida"
                  placeholder="Cole aqui a mensagem inteira."
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!pasted.trim()}
                  onClick={() => void read()}
                >
                  <DownloadSimpleIcon size={20} weight="bold" aria-hidden="true" />
                  &nbsp;Ler mensagem
                </button>
                {error && (
                  <p className="tone-expense small" style={{ margin: 0 }}>
                    {error}
                  </p>
                )}
                {incoming && (
                  <>
                    {!incoming.preview.sameHousehold && (
                      <Field label="Neste celular, quem é você?">
                        <ChoiceChips
                          ariaLabel="Quem é você"
                          value={identity}
                          onChange={setIdentity}
                          options={[
                            { value: '0', label: incoming.preview.theirNames[0] },
                            { value: '1', label: incoming.preview.theirNames[1] },
                          ]}
                        />
                      </Field>
                    )}
                    <p className="subhead" style={{ margin: 0 }}>
                      {incoming.preview.newer > 0
                        ? `${incoming.preview.newer} novidades chegando.`
                        : 'Nada de novo nessa mensagem.'}
                      {!incoming.preview.sameHousehold &&
                        incoming.preview.localHasData &&
                        ' O que já está neste celular continua aqui.'}
                    </p>
                    <button type="button" className="primary-button" onClick={() => void apply()}>
                      {incoming.preview.sameHousehold ? 'Atualizar' : 'Juntar os dois celulares'}
                    </button>
                  </>
                )}
                {settings.lastSyncAt && (
                  <span className="small muted">
                    Última atualização recebida:{' '}
                    {new Date(settings.lastSyncAt).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>
            </Section>
          </>
        )}
      </div>
    </LargeTitlePage>
  );
}
