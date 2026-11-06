import { create } from 'zustand';
import { db, readSettings } from '../../db/database';
import { OtherHouseholdError, syncWithSheet } from '../../io/sheetSync';
import { GoogleApiError, sheetStore } from './googleSheets';
import type { GoogleToken } from './googleAuth';

const TOKEN_KEY = 'duo-google-token';
const SYNCED_KEY = 'duo-sheet-synced-at';
const EXPIRY_MARGIN_MS = 60_000;

export type SheetStatus = 'idle' | 'syncing' | 'needs-login' | 'offline' | 'no-access' | 'error';

interface SheetState {
  status: SheetStatus;
  message: string;
  syncedAt: string | null;
  set: (patch: Partial<Pick<SheetState, 'status' | 'message' | 'syncedAt'>>) => void;
}

function readSyncedAt(): string | null {
  try {
    return localStorage.getItem(SYNCED_KEY);
  } catch {
    return null;
  }
}

export const useSheetState = create<SheetState>((set) => ({
  status: 'idle',
  message: '',
  syncedAt: readSyncedAt(),
  set: (patch) => set(patch),
}));

/** Kept across launches, or every reopen would ask for Google again within the token's hour. */
export function saveToken(token: GoogleToken): void {
  try {
    const value = {
      accessToken: token.accessToken,
      expiresAt: Date.now() + token.expiresInSeconds * 1000,
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(value));
  } catch {
    // Without storage the app just asks to sign in sooner.
  }
}

export function currentToken(): string | null {
  try {
    const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as {
      accessToken: string;
      expiresAt: number;
    } | null;
    return stored && stored.expiresAt - EXPIRY_MARGIN_MS > Date.now() ? stored.accessToken : null;
  } catch {
    return null;
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

let running: Promise<void> | null = null;
let queued = false;

async function runOnce(): Promise<void> {
  const state = useSheetState.getState();
  const { googleSheetId } = await readSettings(db);
  if (!googleSheetId) return state.set({ status: 'idle', message: '' });
  const token = currentToken();
  if (!token) return state.set({ status: 'needs-login', message: '' });
  if (!navigator.onLine) return state.set({ status: 'offline', message: '' });

  state.set({ status: 'syncing', message: '' });
  try {
    await syncWithSheet(sheetStore(token, googleSheetId));
    const syncedAt = new Date().toISOString();
    try {
      // Not in Dexie: writing there would look like a change and start another sync.
      localStorage.setItem(SYNCED_KEY, syncedAt);
    } catch {
      // Only the "last updated" label is lost.
    }
    state.set({ status: 'idle', message: '', syncedAt });
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 401) {
      clearToken();
      state.set({ status: 'needs-login', message: '' });
    } else if (error instanceof GoogleApiError && (error.status === 403 || error.status === 404)) {
      state.set({ status: 'no-access', message: 'Este celular perdeu o acesso à planilha.' });
    } else if (error instanceof OtherHouseholdError) {
      state.set({ status: 'error', message: error.message });
    } else if (error instanceof GoogleApiError) {
      state.set({ status: 'error', message: error.message });
    } else if (error instanceof TypeError) {
      state.set({ status: 'offline', message: '' });
    } else {
      state.set({ status: 'error', message: 'Não deu para sincronizar agora.' });
    }
  }
}

/** One at a time. A request during a run gets one more run, so the last change is never left behind. */
export function runSync(): Promise<void> {
  if (running) {
    queued = true;
    return running;
  }
  running = runOnce().finally(() => {
    running = null;
    if (queued) {
      queued = false;
      void runSync();
    }
  });
  return running;
}
