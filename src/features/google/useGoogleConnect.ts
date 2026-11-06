import { useEffect, useState } from 'react';
import type { ConnectResult } from '../../io/sheetSync';
import { useToast } from '../../ui/useToast';
import { loadGoogle, requestToken } from './googleAuth';
import { connectSignedIn } from './sheetSession';

const TOAST: Record<ConnectResult, string> = {
  created: 'Pronto: seus dados agora ficam na sua conta Google.',
  joined: 'Pronto: seus dados chegaram.',
  already: 'Pronto: tudo em dia.',
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
  const connect = (onDone?: (result: ConnectResult) => void) => {
    setError('');
    setBusy(true);
    requestToken('select_account')
      .then(connectSignedIn)
      .then((result) => {
        if (!result) return;
        void presentToast({ message: TOAST[result], duration: 2600, position: 'top' });
        onDone?.(result);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Não deu certo agora. Tentem de novo.'),
      )
      .finally(() => setBusy(false));
  };

  return { ready, busy, error, connect };
}
