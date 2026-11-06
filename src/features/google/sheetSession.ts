import { create } from 'zustand';
import { db, readSettings } from '../../db/database';
import {
  connectAccount,
  OtherHouseholdError,
  syncWithSheet,
  type ConnectResult,
} from '../../io/sheetSync';
import { fetchEmail, type GoogleToken } from './googleAuth';
import { loadPicker, pickCoupleSheet } from './googlePicker';
import { coupleDrive, GoogleApiError, sheetStore } from './googleSheets';

const TOKEN_KEY = 'duo-google-token';
const SYNCED_KEY = 'duo-sheet-synced-at';
const INVITE_KEY = 'duo-invite';
const EXPIRY_MARGIN_MS = 60_000;

export type SheetStatus = 'idle' | 'syncing' | 'needs-login' | 'offline' | 'no-access' | 'error';

interface SheetState {
  status: SheetStatus;
  message: string;
  syncedAt: string | null;
  invite: string | null;
  set: (patch: Partial<Pick<SheetState, 'status' | 'message' | 'syncedAt'>>) => void;
  clearInvite: () => void;
}

/** Read before the router runs, which would drop the query. Kept in case the page reloads mid-login. */
function readInvite(): string | null {
  const url = new URL(location.href);
  const fromLink = url.searchParams.get('convite');
  try {
    if (fromLink) {
      sessionStorage.setItem(INVITE_KEY, fromLink);
      url.searchParams.delete('convite');
      history.replaceState(null, '', url);
      return fromLink;
    }
    return sessionStorage.getItem(INVITE_KEY);
  } catch {
    return fromLink;
  }
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
  invite: readInvite(),
  set: (patch) => set(patch),
  clearInvite: () => {
    try {
      sessionStorage.removeItem(INVITE_KEY);
    } catch {
      // Nothing stored, nothing to clear.
    }
    set({ invite: null });
  },
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

/**
 * After signing in: the whole setup. A person invited to a sheet may still need to pick it once,
 * because Google only lets the app reach files the person handed to it.
 */
export async function connectSignedIn(token: GoogleToken): Promise<ConnectResult | null> {
  saveToken(token);
  const invite = useSheetState.getState().invite;
  const email = await fetchEmail(token.accessToken);
  const drive = coupleDrive(token.accessToken);
  let result: ConnectResult | null;
  try {
    result = await connectAccount(drive, email, invite);
  } catch (error) {
    const blocked =
      invite && error instanceof GoogleApiError && (error.status === 403 || error.status === 404);
    if (!blocked) throw error;
    await loadPicker();
    const picked = await pickCoupleSheet(token.accessToken, invite);
    if (!picked) return null;
    result = await connectAccount(drive, email, picked);
  }
  useSheetState.getState().clearInvite();
  void runSync();
  return result;
}
