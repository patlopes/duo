import { GoogleLogoIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useData } from '../../db/DataContext';
import { updateSettings } from '../../db/ops';
import { joinSheet, previewSheet, syncWithSheet, type SheetPreview } from '../../io/sheetSync';
import { ChoiceChips, Field, Section } from '../../ui/parts';
import { useToast } from '../../ui/useToast';
import { fetchEmail, loadGoogle, requestToken } from '../google/googleAuth';
import { loadPicker, pickCoupleSheet, pickerConfigured } from '../google/googlePicker';
import { createCoupleSheet, inviteToSheet, sheetStore } from '../google/googleSheets';
import {
  clearToken,
  currentToken,
  runSync,
  saveToken,
  useSheetState,
} from '../google/sheetSession';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Não deu certo agora. Tentem de novo.';

/** One Google sheet both phones read and write, so the couple sees the same numbers. */
export function SheetSection() {
  const { settings, members } = useData();
  const presentToast = useToast();
  const { status, message, syncedAt } = useSheetState();
  const [token, setToken] = useState<string | null>(() => currentToken());
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invitee, setInvitee] = useState('');
  const [picked, setPicked] = useState<{ id: string; preview: SheetPreview } | null>(null);
  const [identity, setIdentity] = useState<'0' | '1'>('1');
  const sheetId = settings.googleSheetId;
  const toast = (text: string) =>
    void presentToast({ message: text, duration: 2600, position: 'top' });

  useEffect(() => {
    let active = true;
    const pieces = pickerConfigured() ? [loadGoogle(), loadPicker()] : [loadGoogle()];
    Promise.all(pieces).then(
      () => active && setReady(true),
      () => active && setError('Sem conexão com o Google agora.'),
    );
    return () => {
      active = false;
    };
  }, []);

  /** Wraps a step so a failure shows up on the screen instead of leaving a dead button. */
  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await step();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  // No await before requestToken: Safari only opens the window inside the tap.
  const signIn = (prompt: '' | 'select_account') => {
    setError('');
    requestToken(prompt).then(
      async (granted) => {
        saveToken(granted);
        setToken(granted.accessToken);
        void runSync();
        setEmail(await fetchEmail(granted.accessToken).catch(() => null));
      },
      (e: unknown) => setError(messageOf(e)),
    );
  };

  const create = (accessToken: string) =>
    run(async () => {
      const id = await createCoupleSheet(accessToken);
      await syncWithSheet(sheetStore(accessToken, id));
      await updateSettings({ googleSheetId: id });
      toast('Planilha criada. Agora convidem o outro celular.');
    });

  const open = (accessToken: string) =>
    run(async () => {
      const id = await pickCoupleSheet(accessToken);
      if (!id) return;
      const preview = await previewSheet(sheetStore(accessToken, id));
      if (preview.sameHousehold) {
        await updateSettings({ googleSheetId: id });
        toast('Este celular voltou a usar a planilha.');
        return;
      }
      setPicked({ id, preview });
      setIdentity(settings.deviceMemberIndex === 0 ? '1' : '0');
    });

  const join = (accessToken: string) =>
    run(async () => {
      if (!picked) return;
      await joinSheet(sheetStore(accessToken, picked.id), Number(identity) as 0 | 1, picked.id);
      setPicked(null);
      toast('Pronto: os dois celulares agora usam os mesmos dados.');
    });

  const invite = (accessToken: string) =>
    run(async () => {
      const address = invitee.trim();
      if (!/^\S+@\S+\.\S+$/.test(address)) throw new Error('Confira o e-mail do convite.');
      await inviteToSheet(accessToken, sheetId!, address);
      setInvitee('');
      toast('Convite enviado por e-mail.');
    });

  const disconnect = () =>
    run(async () => {
      clearToken();
      setToken(null);
      setEmail(null);
      await updateSettings({ googleSheetId: null });
      useSheetState.getState().set({ status: 'idle', message: '', syncedAt: null });
    });

  const other = members[settings.deviceMemberIndex === 0 ? 1 : 0];
  const statusLine =
    status === 'syncing'
      ? 'Sincronizando…'
      : status === 'needs-login' || !token
        ? 'Entre com o Google para sincronizar. O que está aqui continua salvo.'
        : status === 'offline'
          ? 'Sem internet. Sincroniza quando a conexão voltar.'
          : message ||
            (syncedAt
              ? `Sincronizado em ${new Date(syncedAt).toLocaleString('pt-BR')}`
              : 'Ainda não sincronizado.');

  return (
    <Section title="Planilha do casal">
      <div className="card stack rise">
        {!sheetId && (
          <span className="subhead">
            Os dois celulares usam a mesma planilha, na conta Google de vocês, e ficam sempre com os
            mesmos dados. Gastos de uma pessoa só não vão para ela.
          </span>
        )}

        {!token ? (
          <button
            type="button"
            className="primary-button"
            disabled={!ready}
            onClick={() => signIn(sheetId ? '' : 'select_account')}
          >
            <GoogleLogoIcon size={20} weight="bold" aria-hidden="true" />
            &nbsp;Entrar com Google
          </button>
        ) : (
          !sheetId && (
            <>
              {email && <span className="small muted">Conectado como {email}</span>}
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => void create(token)}
              >
                Criar a planilha do casal
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !ready || !pickerConfigured()}
                onClick={() => void open(token)}
              >
                Recebi o convite: abrir a planilha
              </button>
              {!pickerConfigured() && (
                <span className="small muted">
                  Abrir uma planilha recebida ainda não está disponível nesta versão.
                </span>
              )}
            </>
          )
        )}

        {picked && token && (
          <>
            <Field label="Neste celular, quem é você?">
              <ChoiceChips
                ariaLabel="Quem é você"
                value={identity}
                onChange={setIdentity}
                options={[
                  { value: '0', label: picked.preview.names[0] },
                  { value: '1', label: picked.preview.names[1] },
                ]}
              />
            </Field>
            <span className="small muted">
              O que já está neste celular continua e entra na planilha.
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void join(token)}
            >
              Juntar este celular
            </button>
          </>
        )}

        {sheetId && (
          <>
            <span className="small muted" aria-live="polite">
              {statusLine}
            </span>
            {token && (
              <button
                type="button"
                className="secondary-button"
                disabled={status === 'syncing'}
                onClick={() => void runSync()}
              >
                Sincronizar agora
              </button>
            )}
            {token && (
              <div className="stack">
                <Field label={`Convidar ${other.name}`}>
                  <input
                    className="input"
                    type="email"
                    inputMode="email"
                    autoCapitalize="off"
                    autoComplete="off"
                    aria-label="Gmail de quem vai dividir"
                    placeholder="gmail de quem divide com você"
                    value={invitee}
                    onChange={(e) => setInvitee(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || !invitee.trim()}
                  onClick={() => void invite(token)}
                >
                  Enviar convite
                </button>
              </div>
            )}
            <a
              className="tone-link small"
              href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir a planilha no Google
            </a>
            <button type="button" className="link-button" onClick={() => void disconnect()}>
              Desligar este celular da planilha
            </button>
          </>
        )}

        {error && (
          <p className="tone-expense small" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        <a
          className="tone-link small"
          href={`${import.meta.env.BASE_URL}privacidade.html`}
          target="_blank"
          rel="noreferrer"
        >
          Como o app usa sua conta Google
        </a>
      </div>
    </Section>
  );
}
