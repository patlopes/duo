import { IonButton } from '@ionic/react';
import { WalletIcon, XIcon } from '@phosphor-icons/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { readSettings, updateSettings } from '../../db/settingsRepo';
import { shouldOfferInstallGuide } from '../../pwa/platform';
import { EmptyState } from '../../ui/EmptyState';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import styles from './HomePage.module.css';

export function HomePage() {
  const dismissed = useLiveQuery(
    async () => (await readSettings()).installGuideDismissed,
    [],
    true,
  );

  return (
    <LargeTitlePage title="Início">
      {!dismissed && shouldOfferInstallGuide() && (
        <div className={`card ${styles.install}`}>
          <div className={styles.installText}>
            <strong>Instale na Tela de Início</strong>
            <span>Assim o app abre em tela cheia e funciona sem internet.</span>
            <IonButton
              size="small"
              fill="clear"
              routerLink="/install"
              className={styles.installCta}
            >
              Ver como instalar
            </IonButton>
          </div>
          <button
            type="button"
            className={styles.dismiss}
            aria-label="Dispensar aviso de instalação"
            onClick={() => void updateSettings({ installGuideDismissed: true })}
          >
            <XIcon size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      <EmptyState
        icon={<WalletIcon />}
        title="Aqui vai nascer o Início de vocês"
        description="Saldo, contas e gastos do mês chegam na próxima fase."
      />
    </LargeTitlePage>
  );
}
