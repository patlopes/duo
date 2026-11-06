import type { Table } from 'dexie';
import { db, readSettings, type DuoDatabase } from '../db/database';
import { updateSettings } from '../db/ops';
import { ENTITY_SCHEMAS, type EntityTableName } from '../schemas/entities';
import type { SplitMode } from '../schemas/settingsDefaults';
import { applySync, isPrivateRow, type SyncPayload } from './coupleSync';

type Row = Record<string, unknown> & { id: string; updatedAt: string; deletedAt?: string | null };

const TABLES = Object.keys(ENTITY_SCHEMAS) as EntityTableName[];
/** Sheets refuses a cell over 50,000 characters. */
const MAX_CELL = 49_000;
const SETTINGS_ROW = 'settings';
const SPLIT_MODE_ID = 'splitMode';

/** Table, id, updatedAt, deletedAt, JSON: one spreadsheet row per app row, in the tab "dados". */
export type SheetCells = [string, string, string, string, string];

/** The spreadsheet as this module sees it, so tests can run two phones against a fake one. */
export interface SheetStore {
  read(): Promise<string[][]>;
  append(rows: SheetCells[]): Promise<void>;
  update(updates: { rowNumber: number; cells: SheetCells }[]): Promise<void>;
}

interface RemoteRow {
  rowNumber: number;
  table: string;
  id: string;
  updatedAt: string;
  deletedAt: string;
  json: string;
  /** Null when a person edited the cell and it no longer holds a valid row. */
  row: Row | null;
}

export class OtherHouseholdError extends Error {
  constructor() {
    super('Essa planilha é de outro casal. Abra de novo para juntar este celular a ela.');
  }
}

function readSplitMode(json: string): SplitMode | null {
  try {
    const { splitMode } = JSON.parse(json) as { splitMode?: unknown };
    return splitMode === 'equal' || splitMode === 'proportional' ? splitMode : null;
  } catch {
    return null;
  }
}

function parseRow(table: string, json: string): Row | null {
  if (!json || !(table in ENTITY_SCHEMAS)) return null;
  try {
    const parsed = ENTITY_SCHEMAS[table as EntityTableName].safeParse(JSON.parse(json));
    return parsed.success ? (parsed.data as unknown as Row) : null;
  } catch {
    return null;
  }
}

/** Two phones can add the same row at once, so the newest copy of each id is the one that counts. */
function readRemote(values: string[][]): Map<string, RemoteRow> {
  const rows = new Map<string, RemoteRow>();
  values.forEach((cells, index) => {
    const [table, id, updatedAt, deletedAt, json] = cells.map((c) => String(c ?? ''));
    if (!table || !id) return;
    const key = `${table}/${id}`;
    const seen = rows.get(key);
    if (seen && seen.updatedAt >= (updatedAt ?? '')) return;
    const row = table === SETTINGS_ROW ? null : parseRow(table, json ?? '');
    rows.set(key, {
      rowNumber: index + 2,
      table,
      id,
      updatedAt: updatedAt ?? '',
      deletedAt: deletedAt ?? '',
      json: json ?? '',
      row,
    });
  });
  return rows;
}

/** Deleted and personal rows leave only a marker: their contents don't stay in a shared file. */
function cellsOf(table: EntityTableName, row: Row): SheetCells | null {
  if (isPrivateRow(table, row)) return [table, row.id, row.updatedAt, row.updatedAt, ''];
  if (row.deletedAt) return [table, row.id, row.updatedAt, row.deletedAt, ''];
  const json = JSON.stringify(row);
  return json.length > MAX_CELL ? null : [table, row.id, row.updatedAt, '', json];
}

export interface SyncOutcome {
  received: number;
  sent: number;
}

/** Each side keeps, row by row, the most recent edit. Safe to repeat: a second run changes nothing. */
export async function syncWithSheet(
  store: SheetStore,
  database: DuoDatabase = db,
): Promise<SyncOutcome> {
  const remote = readRemote(await store.read());
  const local = await database.households.toCollection().first();
  const theirs = [...remote.values()].find((r) => r.table === 'households' && r.row);
  if (theirs && local && theirs.id !== local.id) throw new OtherHouseholdError();

  const toAppend: SheetCells[] = [];
  const toUpdate: { rowNumber: number; cells: SheetCells }[] = [];
  let received = 0;

  await database.transaction(
    'rw',
    TABLES.map((t) => database.table(t)),
    async () => {
      for (const t of TABLES) {
        const table = database.table(t) as Table<Row, string>;
        const mine = new Map((await table.toArray()).map((row) => [row.id, row]));

        for (const entry of remote.values()) {
          if (entry.table !== t) continue;
          const existing = mine.get(entry.id);
          if (existing && existing.updatedAt >= entry.updatedAt) continue;
          if (entry.row && !isPrivateRow(t, entry.row)) {
            await table.put(entry.row);
            mine.set(entry.id, entry.row);
            received++;
          } else if (entry.deletedAt && existing) {
            const patch = { deletedAt: entry.deletedAt, updatedAt: entry.updatedAt };
            await table.update(entry.id, patch);
            mine.set(entry.id, { ...existing, ...patch });
            received++;
          }
        }

        for (const row of mine.values()) {
          const entry = remote.get(`${t}/${row.id}`);
          const cells = cellsOf(t, row);
          if (!cells) continue;
          if (!entry) {
            // A personal row the other phone never saw has nothing to hide.
            if (!isPrivateRow(t, row) && !row.deletedAt) toAppend.push(cells);
            continue;
          }
          const stale = entry.updatedAt < row.updatedAt;
          const unreadable = !entry.row && !entry.deletedAt;
          const exposed = isPrivateRow(t, row) && !entry.deletedAt;
          if (stale || unreadable || exposed) toUpdate.push({ rowNumber: entry.rowNumber, cells });
        }
      }
    },
  );

  const settings = await readSettings(database);
  const mode = remote.get(`${SETTINGS_ROW}/${SPLIT_MODE_ID}`);
  const myModeAt = settings.splitModeAt ?? '';
  const theirMode = mode ? readSplitMode(mode.json) : null;
  if (mode && theirMode && mode.updatedAt > myModeAt) {
    await updateSettings({ splitMode: theirMode, splitModeAt: mode.updatedAt }, database);
    received++;
  } else if (myModeAt && (!mode || mode.updatedAt < myModeAt)) {
    const cells: SheetCells = [
      SETTINGS_ROW,
      SPLIT_MODE_ID,
      myModeAt,
      '',
      JSON.stringify({ splitMode: settings.splitMode }),
    ];
    if (mode) toUpdate.push({ rowNumber: mode.rowNumber, cells });
    else toAppend.push(cells);
  }

  if (toUpdate.length) await store.update(toUpdate);
  if (toAppend.length) await store.append(toAppend);
  return { received, sent: toUpdate.length + toAppend.length };
}

export interface SheetPreview {
  sameHousehold: boolean;
  names: [string, string];
}

/** What joining would mean, read before anything on this phone changes. */
export async function previewSheet(
  store: SheetStore,
  database: DuoDatabase = db,
): Promise<SheetPreview> {
  const payload = payloadOf(await store.read());
  const household = payload.tables.households?.[0];
  if (!household) throw new Error('Essa planilha ainda está vazia. Abra o app de quem a criou.');
  const local = await database.households.toCollection().first();
  const ids = household.memberIds as string[];
  const names = ids.map((id) =>
    String(payload.tables.members?.find((m) => m.id === id)?.name ?? ''),
  ) as [string, string];
  return { sameHousehold: local?.id === household.id, names };
}

function payloadOf(values: string[][]): SyncPayload {
  const tables: Record<string, Row[]> = {};
  for (const entry of readRemote(values).values()) {
    if (entry.row && !entry.deletedAt) (tables[entry.table] ??= []).push(entry.row);
  }
  return {
    format: 'duo-sync',
    schemaVersion: 1,
    sentAt: new Date().toISOString(),
    fromMemberIndex: 0,
    tables,
  };
}

/** Rewrites this phone onto the sheet's household, keeping what is here, then sends it all up. */
export async function joinSheet(
  store: SheetStore,
  myIndex: 0 | 1,
  sheetId: string,
  database: DuoDatabase = db,
): Promise<SyncOutcome> {
  await applySync(payloadOf(await store.read()), myIndex, database);
  await updateSettings({ googleSheetId: sheetId }, database);
  return syncWithSheet(store, database);
}
