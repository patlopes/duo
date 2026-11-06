import { IonItem, IonLabel, IonSegment, IonSegmentButton } from '@ionic/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BRAND } from '../../brand';
import { readSettings, updateSettings } from '../../db/settingsRepo';
import { ThemeModeSchema } from '../../schemas/settings';
import { GroupedList } from '../../ui/GroupedList';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import styles from './MorePage.module.css';

export function MorePage() {
  const theme = useLiveQuery(async () => (await readSettings()).theme, [], 'system');

  return (
    <LargeTitlePage title="Mais">
      <GroupedList title="Aparência">
        <IonItem lines="none">
          <IonSegment
            aria-label="Tema do app"
            value={theme}
            onIonChange={(event) => {
              const parsed = ThemeModeSchema.safeParse(event.detail.value);
              if (parsed.success) void updateSettings({ theme: parsed.data });
            }}
          >
            <IonSegmentButton value="system">
              <IonLabel>Automático</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="light">
              <IonLabel>Claro</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="dark">
              <IonLabel>Escuro</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonItem>
      </GroupedList>

      <GroupedList title="Sobre o app">
        <IonItem routerLink="/install" detail>
          <IonLabel>Como instalar no iPhone</IonLabel>
        </IonItem>
        <IonItem routerLink="/debug" detail>
          <IonLabel>Diagnóstico do aparelho</IonLabel>
        </IonItem>
      </GroupedList>

      <p className={styles.version}>
        {BRAND.name} · versão {__BUILD_ID__}
      </p>
    </LargeTitlePage>
  );
}
