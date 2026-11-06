import { IonItem, IonLabel } from '@ionic/react';
import { useEffect, useState } from 'react';
import { GroupedList } from '../../ui/GroupedList';
import {
  createTestSheet,
  fetchEmail,
  loadGoogle,
  requestToken,
  type GooglePrompt,
} from './googleAuth';

/**
 * The open question before building sync on Sheets: without a server, a login lasts about an hour, so
 * does renewing it work on an installed iPhone app? This screen reports what actually happens there.
 */
export function GoogleTest() {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const note = (line: string) => setLines((all) => [...all, line]);

  useEffect(() => {
    let active = true;
    loadGoogle().then(
      () => active && setState('ready'),
      () => active && setState('failed'),
    );
    return () => {
      active = false;
    };
  }, []);

  const signIn = (prompt: GooglePrompt, label: string) => {
    const started = Date.now();
    // No await before this: the popup has to open inside the tap.
    requestToken(prompt).then(
      async (token) => {
        setAccessToken(token.accessToken);
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        const who = await fetchEmail(token.accessToken);
        setEmail(who);
        note(
          `${label}: certo em ${seconds} s, vale por ${Math.round(token.expiresInSeconds / 60)} min.`,
        );
      },
      (error: Error) => note(`${label}: ${error.message}`),
    );
  };

  const makeSheet = async () => {
    if (!accessToken) return;
    try {
      setSheetUrl(await createTestSheet(accessToken));
      note('Planilha de teste criada.');
    } catch (error) {
      note(`Planilha: ${(error as Error).message}`);
    }
  };

  return (
    <GroupedList title="Conta Google (teste)">
      <IonItem
        button
        detail={false}
        disabled={state !== 'ready'}
        onClick={() => signIn('select_account', 'Entrar')}
      >
        <IonLabel>
          {state === 'failed'
            ? 'Sem conexão com o Google'
            : email
              ? `Entrou como ${email}`
              : 'Entrar com Google'}
        </IonLabel>
      </IonItem>
      <IonItem
        button
        detail={false}
        disabled={state !== 'ready' || !email}
        onClick={() => signIn('', 'Renovar')}
      >
        <IonLabel>Renovar sem entrar de novo</IonLabel>
      </IonItem>
      <IonItem button detail={false} disabled={!accessToken} onClick={() => void makeSheet()}>
        <IonLabel>Criar planilha de teste</IonLabel>
      </IonItem>
      {sheetUrl && (
        <IonItem href={sheetUrl} target="_blank" rel="noreferrer" detail>
          <IonLabel>Abrir a planilha</IonLabel>
        </IonItem>
      )}
      {lines.length > 0 && (
        <IonItem lines="none">
          <IonLabel className="ion-text-wrap" aria-live="polite">
            {lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </IonLabel>
        </IonItem>
      )}
    </GroupedList>
  );
}
