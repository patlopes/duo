import { useState } from 'react';
import { useData } from '../../db/DataContext';
import { Section } from '../../ui/parts';
import { AccountBar } from '../google/AccountBar';
import { GoogleButton } from '../google/GoogleButton';
import { currentToken, runSync, useSheetState } from '../google/sheetSession';
import { InviteSheet } from './InviteSheet';

/** One Google sheet both phones read and write, so the couple sees the same numbers. */
export function SheetSection() {
  const { settings, members } = useData();
  const { status, message, syncedAt } = useSheetState();
  const [inviting, setInviting] = useState(false);
  const sheetId = settings.googleSheetId;
  const token = currentToken();
  const me = settings.deviceMemberIndex;
  const other = members[me === 0 ? 1 : 0];
  const otherEmail = settings.googleEmails[me === 0 ? 1 : 0];

  const statusLine =
    status === 'syncing'
      ? 'Sincronizando…'
      : status === 'offline'
        ? 'Sem internet. Sincroniza quando a conexão voltar.'
        : message ||
          (syncedAt
            ? `Em dia. Última vez em ${new Date(syncedAt).toLocaleString('pt-BR')}`
            : 'Ainda não sincronizado.');

  return (
    <Section title="Vocês dois, em todo lugar">
      <div className="card stack rise">
        {!sheetId ? (
          <>
            <span className="subhead">
              Entre com o Google e seus dados aparecem em qualquer celular ou computador, e nos dois
              celulares de vocês. Ficam numa planilha na sua conta. Gastos de uma pessoa só não vão.
            </span>
            <GoogleButton />
          </>
        ) : (
          <>
            <AccountBar />
            {!token && (
              <>
                <span className="subhead">Entre de novo para atualizar. Nada se perde aqui.</span>
                <GoogleButton />
              </>
            )}
            {token && (
              <span className="small muted" aria-live="polite">
                {statusLine}
              </span>
            )}
            {otherEmail ? (
              <span className="subhead">
                {other.name} usa os mesmos dados ({otherEmail}).
              </span>
            ) : (
              <button type="button" className="primary-button" onClick={() => setInviting(true)}>
                Convidar {other.name}
              </button>
            )}
            {token && (
              <button
                type="button"
                className="secondary-button"
                disabled={status === 'syncing'}
                onClick={() => void runSync()}
              >
                Atualizar agora
              </button>
            )}
            <a
              className="tone-link small"
              href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
              target="_blank"
              rel="noreferrer"
            >
              Ver a planilha no Google
            </a>
          </>
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
      {inviting && <InviteSheet onClose={() => setInviting(false)} />}
    </Section>
  );
}
