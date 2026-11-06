import { useEffect } from 'react';
import { useData } from '../../db/DataContext';
import { loadGoogle } from './googleAuth';
import { runSync, useSheetState } from './sheetSession';

const AFTER_CHANGE_MS = 4_000;
const WHILE_OPEN_MS = 60_000;

/** Keeps a linked phone in step: after each change, on returning to the app and once a minute. */
export function SheetSyncHost() {
  const data = useData();
  const sheetId = data.settings.googleSheetId;
  const status = useSheetState((s) => s.status);

  useEffect(() => {
    if (!sheetId) return;
    const timer = setTimeout(() => void runSync(), AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [data, sheetId]);

  useEffect(() => {
    if (!sheetId) return;
    void runSync();
    const check = () => {
      if (document.visibilityState === 'visible') void runSync();
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    const every = setInterval(check, WHILE_OPEN_MS);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      clearInterval(every);
    };
  }, [sheetId]);

  // Ready ahead of the tap: Safari only opens Google's window inside the tap itself.
  useEffect(() => {
    if (status === 'needs-login') void loadGoogle().catch(() => undefined);
  }, [status]);

  return null;
}
