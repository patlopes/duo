import { useIonToast } from '@ionic/react';
import { useCallback } from 'react';

type ToastOptions = Parameters<ReturnType<typeof useIonToast>[0]>[0];

/**
 * Ionic's hook silently drops a toast while another one is open, which could swallow a confirmation
 * and its "Desfazer". Here the newest message always replaces the previous one.
 */
export function useToast() {
  const [present, dismiss] = useIonToast();
  return useCallback(
    async (options: Exclude<ToastOptions, string>) => {
      await dismiss();
      await present(options);
    },
    [present, dismiss],
  );
}
