import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface LargeTitlePageProps {
  title: string;
  /** Stacked screens pass this so a deep link still has somewhere to go back to. */
  backHref?: string;
  toolbarEnd?: ReactNode;
  children: ReactNode;
}

/** A parent written as `/tabs/more/x` becomes `/tabs/home/x` when the screen was opened from Início. */
function parentInTab(backHref: string, pathname: string): string {
  const tab = pathname.match(/^\/tabs\/(home|planning|more)(\/|$)/)?.[1];
  if (!tab || tab === 'more' || !backHref.startsWith('/tabs/more')) return backHref;
  return backHref.replace('/tabs/more', `/tabs/${tab}`);
}

/** The iOS large title that collapses into the toolbar on scroll. */
export function LargeTitlePage({ title, backHref, toolbarEnd, children }: LargeTitlePageProps) {
  const { pathname } = useLocation();
  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar>
          {backHref && (
            <IonButtons slot="start">
              <IonBackButton defaultHref={parentInTab(backHref, pathname)} text="Voltar" />
            </IonButtons>
          )}
          <IonTitle>{title}</IonTitle>
          {toolbarEnd && <IonButtons slot="end">{toolbarEnd}</IonButtons>}
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">{title}</IonTitle>
          </IonToolbar>
        </IonHeader>
        {children}
      </IonContent>
    </IonPage>
  );
}
