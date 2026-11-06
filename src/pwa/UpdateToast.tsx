import { IonToast } from '@ionic/react';
import { usePwaStore } from './pwaStore';

export function UpdateToast() {
  const applyUpdate = usePwaStore((s) => s.applyUpdate);
  const setApplyUpdate = usePwaStore((s) => s.setApplyUpdate);

  return (
    <IonToast
      isOpen={applyUpdate !== null}
      message="Nova versão disponível"
      position="top"
      buttons={[
        { text: 'Agora não', role: 'cancel', handler: () => setApplyUpdate(null) },
        { text: 'Atualizar', handler: () => applyUpdate?.() },
      ]}
    />
  );
}
