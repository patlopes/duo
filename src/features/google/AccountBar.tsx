import { useIonAlert } from '@ionic/react';
import { useData } from '../../db/DataContext';
import { signOutGoogle } from './sheetSession';

/** Always on screen once signed in: entering with the wrong account has to be obvious and undoable. */
export function AccountBar() {
  const { settings } = useData();
  const [presentAlert] = useIonAlert();
  if (!settings.googleSheetId) return null;
  const email = settings.googleAccount ?? settings.googleEmails[settings.deviceMemberIndex];

  const askToLeave = () =>
    void presentAlert({
      header: 'Sair da conta Google?',
      message:
        'Os dados continuam neste aparelho, mas ele para de sincronizar até você entrar de novo.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Sair', role: 'destructive', handler: () => void signOutGoogle() },
      ],
    });

  return (
    <div className="account-bar rise">
      <span className="account-avatar" aria-hidden="true">
        {(email ?? 'G').charAt(0).toUpperCase()}
      </span>
      <span className="account-text">
        <span>Conectado como</span>
        <strong>{email ?? 'Conta Google'}</strong>
      </span>
      <button type="button" className="account-out" onClick={askToLeave}>
        Sair
      </button>
    </div>
  );
}
