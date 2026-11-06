import { useIonActionSheet, useIonAlert } from '@ionic/react';
import { useCallback } from 'react';
import { useData } from '../../db/DataContext';
import { reopenMonth, type EditScope } from '../../db/ops';
import { isMonthClosed } from '../../domain/split';

/** "Só esta, esta e as próximas, todas" for rows that belong to a series (spec 2.5). */
export function useScopePrompt() {
  const [present] = useIonActionSheet();
  return useCallback(
    (header: string) =>
      new Promise<EditScope | null>((resolve) => {
        void present({
          header,
          buttons: [
            { text: 'Só esta', handler: () => resolve('one') },
            { text: 'Esta e as próximas', handler: () => resolve('forward') },
            { text: 'Todas', handler: () => resolve('all') },
            { text: 'Cancelar', role: 'cancel', handler: () => resolve(null) },
          ],
          onDidDismiss: () => resolve(null),
        });
      }),
    [present],
  );
}

/** A closed month holds a frozen settlement, so changing it has to be a deliberate act (spec 5.5). */
export function useClosedMonthGuard() {
  const { closes } = useData();
  const [present] = useIonAlert();
  return useCallback(
    (month: string) =>
      new Promise<boolean>((resolve) => {
        if (!isMonthClosed(closes, month)) {
          resolve(true);
          return;
        }
        void present({
          header: 'Este mês está fechado',
          message:
            'Para mudar um lançamento dele, o mês será reaberto e o acerto volta a ser calculado.',
          buttons: [
            { text: 'Cancelar', role: 'cancel', handler: () => resolve(false) },
            {
              text: 'Reabrir',
              handler: () => {
                void reopenMonth(month).then(() => resolve(true));
              },
            },
          ],
        });
      }),
    [closes, present],
  );
}
