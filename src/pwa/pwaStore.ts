import { create } from 'zustand';

interface PwaState {
  /** Set while a new version is waiting; calling it activates that version and reloads. */
  applyUpdate: (() => void) | null;
  setApplyUpdate: (apply: (() => void) | null) => void;
  /** Chrome's deferred install prompt, when it offers one. iOS never does. */
  installPrompt: { prompt: () => Promise<void> } | null;
  setInstallPrompt: (event: { prompt: () => Promise<void> } | null) => void;
}

export const usePwaStore = create<PwaState>((set) => ({
  applyUpdate: null,
  setApplyUpdate: (applyUpdate) => set({ applyUpdate }),
  installPrompt: null,
  setInstallPrompt: (installPrompt) => set({ installPrompt }),
}));
