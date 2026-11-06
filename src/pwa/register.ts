import { usePwaStore } from './pwaStore';

const BASE = import.meta.env.BASE_URL;
const CHECK_EVERY_MS = 5 * 60 * 1000;

let registration: ServiceWorkerRegistration | null = null;
const watched = new WeakSet<ServiceWorkerRegistration>();

function offerUpdate(worker: ServiceWorker): void {
  usePwaStore.getState().setApplyUpdate(() => {
    usePwaStore.getState().setUpdating(true);
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });
    worker.postMessage({ type: 'SKIP_WAITING' });
    // If the worker never takes over, reloading still beats a button that seems to do nothing.
    setTimeout(() => location.reload(), 3000);
  });
}

function watch(reg: ServiceWorkerRegistration): void {
  if (watched.has(reg)) return;
  watched.add(reg);
  // With no controller this is the first install, not an update: nothing to announce.
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller)
        offerUpdate(installing);
    });
  });
}

/**
 * GitHub Pages caches sw.js for up to 10 minutes and its headers cannot be changed, so a plain
 * registration.update() can keep missing a new deploy. version.json, fetched with a throwaway query,
 * tells the truth right away; registering the worker under a versioned URL then skips that cache too.
 */
export async function checkForUpdate(): Promise<'current' | 'found' | 'unknown'> {
  if (!registration || !navigator.onLine) return 'unknown';
  try {
    const response = await fetch(`${BASE}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return 'unknown';
    const { build } = (await response.json()) as { build: string };
    if (!build || build === __BUILD_ID__) return 'current';
    if (registration.waiting || registration.installing) return 'found';
    registration = await navigator.serviceWorker.register(`${BASE}sw.js?v=${build}`, {
      scope: BASE,
      updateViaCache: 'none',
    });
    watch(registration);
    return 'found';
  } catch {
    // Offline or a flaky connection: the app keeps working, and the next check tries again.
    return 'unknown';
  }
}

export function initServiceWorker(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    usePwaStore.getState().setInstallPrompt(event as unknown as { prompt: () => Promise<void> });
  });
  window.addEventListener('appinstalled', () => usePwaStore.getState().setInstallPrompt(null));

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  // Registering again under a different URL would reinstall the worker on every launch, so an existing
  // registration is kept as it is. On first install the URL names this build, like checkForUpdate does.
  void navigator.serviceWorker
    .getRegistration(BASE)
    .then(
      (existing) =>
        existing ??
        navigator.serviceWorker.register(`${BASE}sw.js?v=${__BUILD_ID__}`, {
          scope: BASE,
          updateViaCache: 'none',
        }),
    )
    .then((reg) => {
      registration = reg;
      watch(reg);
      void checkForUpdate();
    })
    .catch(() => undefined);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.addEventListener('online', () => void checkForUpdate());
  setInterval(() => void checkForUpdate(), CHECK_EVERY_MS);
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
