import { create } from 'zustand';

interface PwaState {
  /** Set while a new version is waiting; calling it activates that version and reloads. */
  applyUpdate: (() => void) | null;
  setApplyUpdate: (apply: (() => void) | null) => void;
}

export const usePwaStore = create<PwaState>((set) => ({
  applyUpdate: null,
  setApplyUpdate: (applyUpdate) => set({ applyUpdate }),
}));
