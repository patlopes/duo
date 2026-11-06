import { IonToast } from '@ionic/react';
import { usePwaStore } from './pwaStore';

export function UpdateToast() {
  const applyUpdate = usePwaStore((s) => s.applyUpdate);
  const setApplyUpdate = usePwaStore((s) => s.setApplyUpdate);
  const updating = usePwaStore((s) => s.updating);

  return (
    <IonToast
      isOpen={applyUpdate !== null}
      message={updating ? 'Atualizando…' : 'Nova versão disponível'}
      position="top"
      buttons={
        updating
          ? []
          : [
              { text: 'Agora não', role: 'cancel', handler: () => setApplyUpdate(null) },
              {
                text: 'Atualizar',
                // Returning false keeps the toast up, so the tap has visible feedback until the reload.
                handler: () => {
                  applyUpdate?.();
                  return false;
                },
              },
            ]
      }
    />
  );
}
