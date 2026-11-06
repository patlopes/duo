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

interface LargeTitlePageProps {
  title: string;
  /** Stacked screens pass this so a deep link still has somewhere to go back to. */
  backHref?: string;
  toolbarEnd?: ReactNode;
  children: ReactNode;
}

/** The iOS large title that collapses into the toolbar on scroll. */
export function LargeTitlePage({ title, backHref, toolbarEnd, children }: LargeTitlePageProps) {
  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar>
          {backHref && (
            <IonButtons slot="start">
              <IonBackButton defaultHref={backHref} text="Voltar" />
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
