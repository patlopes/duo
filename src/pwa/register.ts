import { registerSW } from 'virtual:pwa-register';
import { usePwaStore } from './pwaStore';

export function initServiceWorker(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    usePwaStore.getState().setInstallPrompt(event as unknown as { prompt: () => Promise<void> });
  });
  window.addEventListener('appinstalled', () => usePwaStore.getState().setInstallPrompt(null));

  if (!('serviceWorker' in navigator)) return;

  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      usePwaStore.getState().setApplyUpdate(() => void updateServiceWorker(true));
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // iOS keeps the app suspended for days, so "back on screen" is when updates get checked.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void registration.update();
        }
      });
    },
  });
}

/** iOS may evict storage regardless, which is why backups are a product feature (spec 6.6). */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
