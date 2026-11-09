import { useEffect, useState } from 'react';
import type { ConnectResult } from '../../io/sheetSync';
import { useToast } from '../../ui/useToast';
import { loadGoogle, requestToken } from './googleAuth';
import { connectSignedIn } from './sheetSession';

const TOAST: Record<ConnectResult, (email: string) => string> = {
  created: (email) => `Pronto: conectado como ${email}.`,
  joined: (email) => `Pronto: seus dados chegaram em ${email}.`,
  already: (email) => `Pronto: conectado como ${email}.`,
};

/** The one sign-in every screen shares: a tap, and the app sorts out the rest. */
export function useGoogleConnect() {
  const presentToast = useToast();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadGoogle().then(
      () => active && setReady(true),
      () => active && setError('Sem conexão com o Google agora.'),
    );
    return () => {
      active = false;
    };
  }, []);

  // No await before requestToken: Safari only opens Google's window inside the tap.
  // Not "busy" while that window is up: if it dies unnoticed, the button still has to work.
  const connect = (onDone?: (result: ConnectResult) => void) => {
    setError('');
    requestToken('select_account')
      .then((token) => {
        setBusy(true);
        return connectSignedIn(token);
      })
      .then((connected) => {
        if (!connected) return;
        void presentToast({
          message: TOAST[connected.result](connected.email),
          duration: 3000,
          position: 'top',
        });
        onDone?.(connected.result);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Não deu certo agora. Tentem de novo.'),
      )
      .finally(() => setBusy(false));
  };

  return { ready, busy, error, connect };
}
