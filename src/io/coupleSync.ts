import type { Table } from 'dexie';
import { db, readSettings, type DuoDatabase } from '../db/database';
import { stamp, updateSettings } from '../db/ops';
import {
  ENTITY_SCHEMAS,
  type ChangeOp,
  type EntityTableName,
  type Household,
  type ImportLog,
  type SplitRule,
} from '../schemas/entities';

type Row = Record<string, unknown> & { id: string; updatedAt: string; deletedAt?: string | null };

const TABLES = Object.keys(ENTITY_SCHEMAS) as EntityTableName[];
const PREFIX = 'MEUBEM1:';

export interface SyncPayload {
  format: 'duo-sync';
  schemaVersion: 1;
  sentAt: string;
  fromMemberIndex: 0 | 1;
  tables: Record<string, Row[]>;
}

/** Personal spending stays on its owner's phone: only what the couple shares travels (spec 2.10). */
export function isPrivateRow(table: EntityTableName, row: Row): boolean {
  if (table !== 'transactions') return false;
  return row.splitRule === 'memberA' || row.splitRule === 'memberB';
}

export async function buildSyncPayload(database: DuoDatabase = db): Promise<SyncPayload> {
  const settings = await readSettings(database);
  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) {
    const rows = (await database.table(t).toArray()) as Row[];
    tables[t] = rows.filter((row) => !isPrivateRow(t, row));
  }
  return {
    format: 'duo-sync',
    schemaVersion: 1,
    sentAt: new Date().toISOString(),
    fromMemberIndex: settings.deviceMemberIndex,
    tables,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normal), (c) => c.charCodeAt(0));
}

/** A compact text, because pasting into a chat is the easiest way between two phones. */
export async function encodePayload(payload: SyncPayload): Promise<string> {
  const { gzipSync, strToU8 } = await import('fflate');
  return PREFIX + toBase64Url(gzipSync(strToU8(JSON.stringify(payload)), { level: 9 }));
}

export async function decodePayload(text: string): Promise<SyncPayload> {
  const match = text.match(/MEUBEM1:([A-Za-z0-9_-]+)/);
  if (!match)
    throw new Error('Não encontrei os dados do Meu Bem nesse texto. Copie a mensagem inteira.');
  const { gunzipSync, strFromU8 } = await import('fflate');
  let payload: SyncPayload;
  try {
    payload = JSON.parse(strFromU8(gunzipSync(fromBase64Url(match[1]!)))) as SyncPayload;
  } catch {
    throw new Error('Essa mensagem veio cortada. Peça para enviarem de novo.');
  }
  if (payload.format !== 'duo-sync' || payload.schemaVersion !== 1) {
    throw new Error('Esses dados são de outra versão do app. Atualizem os dois celulares.');
  }
  return payload;
}

export interface SyncPreview {
  sameHousehold: boolean;
  incoming: number;
  newer: number;
  theirNames: [string, string];
  localHasData: boolean;
}

function incomingHousehold(payload: SyncPayload): Household {
  const household = payload.tables.households?.[0] as unknown as Household | undefined;
  if (!household) throw new Error('Esses dados não têm uma casa para juntar.');
  return household;
}

function isNewer(incoming: Row, existing: Row | undefined): boolean {
  return !existing || existing.updatedAt < incoming.updatedAt;
}

export async function previewSync(
  payload: SyncPayload,
  database: DuoDatabase = db,
): Promise<SyncPreview> {
  const local = await database.households.toCollection().first();
  const theirs = incomingHousehold(payload);
  const sameHousehold = local?.id === theirs.id;
  let newer = 0;
  let incoming = 0;
  for (const t of TABLES) {
    const table = database.table(t) as Table<Row, string>;
    for (const row of payload.tables[t] ?? []) {
      incoming++;
      if (isNewer(row, await table.get(row.id))) newer++;
    }
  }
  const names = theirs.memberIds.map((id) =>
    String(payload.tables.members?.find((m) => m.id === id)?.name ?? ''),
  ) as [string, string];
  const localRows = await database.transactions.count();
  return { sameHousehold, incoming, newer, theirNames: names, localHasData: localRows > 0 };
}

/** The other member's rule, for when the two phones numbered the same two people differently. */
const SWAPPED_RULE: Record<SplitRule, SplitRule> = {
  proportional: 'proportional',
  equal: 'equal',
  memberA: 'memberB',
  memberB: 'memberA',
};

/**
 * Two phones that started apart have different ids for the same people, categories and joint account.
 * Joining rewrites this phone's rows to the other's ids, so that both then speak about the same things.
 */
async function adoptHousehold(
  payload: SyncPayload,
  myIndex: 0 | 1,
  database: DuoDatabase,
): Promise<void> {
  const theirs = incomingHousehold(payload);
  const local = await database.households.toCollection().first();
  if (!local) throw new Error('App ainda não inicializado.');
  const settings = await readSettings(database);

  const memberMap = new Map<string, string>();
  const meHere = local.memberIds[settings.deviceMemberIndex];
  const otherHere = local.memberIds[settings.deviceMemberIndex === 0 ? 1 : 0];
  memberMap.set(meHere, theirs.memberIds[myIndex]);
  memberMap.set(otherHere, theirs.memberIds[myIndex === 0 ? 1 : 0]);
  const swapRules = settings.deviceMemberIndex !== myIndex;

  const idMap = new Map<string, string>(memberMap);
  const localCategories = (await database.categories.toArray()) as unknown as Row[];
  for (const category of localCategories) {
    const twin = payload.tables.categories?.find(
      (c) => c.name === category.name && c.kind === category.kind && !c.deletedAt,
    );
    if (twin) idMap.set(category.id, twin.id);
  }
  // The joint account is one real account, so both phones' copies must become the same row.
  const localAccounts = (await database.accounts.toArray()) as unknown as Row[];
  const incomingAccounts = payload.tables.accounts ?? [];
  for (const acc of localAccounts) {
    const owner = acc.ownerMemberId ? memberMap.get(String(acc.ownerMemberId)) : null;
    const twin =
      acc.type === 'joint'
        ? incomingAccounts.find((x) => x.type === 'joint' && !x.deletedAt)
        : incomingAccounts.find(
            (x) => x.type === acc.type && x.ownerMemberId === owner && !x.deletedAt,
          );
    if (twin) idMap.set(acc.id, twin.id);
  }

  const REF_FIELDS = [
    'ownerMemberId',
    'payerMemberId',
    'memberId',
    'categoryId',
    'parentId',
    'accountId',
    'fromAccountId',
    'toAccountId',
    'paymentAccountId',
  ];
  const remap = (row: Row): Row => {
    const next: Row = { ...row, householdId: theirs.id, id: idMap.get(row.id) ?? row.id };
    for (const field of REF_FIELDS) {
      const value = next[field];
      if (typeof value === 'string' && idMap.has(value)) next[field] = idMap.get(value);
    }
    if (swapRules) {
      for (const field of ['splitRule', 'defaultSplitRule']) {
        const rule = next[field] as SplitRule | undefined;
        if (rule && SWAPPED_RULE[rule]) next[field] = SWAPPED_RULE[rule];
      }
    }
    return next;
  };

  await database.transaction(
    'rw',
    TABLES.map((t) => database.table(t)),
    async () => {
      for (const t of TABLES) {
        const table = database.table(t) as Table<Row, string>;
        const rows = await table.toArray();
        await table.clear();
        if (t === 'households' || t === 'members') continue;
        // Rows merged onto a twin keep the twin's id, so only the first of each survives this bulk put.
        await table.bulkPut(rows.map(remap));
      }
    },
  );
}

export interface SyncResult {
  applied: number;
  skipped: number;
  logId: string | null;
}

/** Keeps, for each row, whichever side edited it last. Deletions travel too, as tombstones. */
export async function applySync(
  payload: SyncPayload,
  myIndex: 0 | 1,
  database: DuoDatabase = db,
): Promise<SyncResult> {
  const theirs = incomingHousehold(payload);
  const local = await database.households.toCollection().first();
  const joining = local?.id !== theirs.id;
  if (joining) await adoptHousehold(payload, myIndex, database);

  for (const t of TABLES) {
    for (const row of payload.tables[t] ?? []) {
      const parsed = ENTITY_SCHEMAS[t].safeParse(row);
      if (!parsed.success) throw new Error(`Registro inválido em ${t}: dados não aplicados.`);
    }
  }

  let applied = 0;
  let skipped = 0;
  const inverseOps: ChangeOp[] = [];
  const log: ImportLog = {
    ...stamp(theirs.id),
    kind: 'backup',
    appliedAt: new Date().toISOString(),
    summary: '',
    inverseOps,
    undoneAt: null,
  };

  await database.transaction(
    'rw',
    [...TABLES.map((t) => database.table(t)), database.importLogs],
    async () => {
      for (const t of TABLES) {
        const table = database.table(t) as Table<Row, string>;
        for (const row of payload.tables[t] ?? []) {
          const existing = await table.get(row.id);
          if (!isNewer(row, existing)) {
            skipped++;
            continue;
          }
          inverseOps.push({ table: t, id: row.id, before: existing ?? null });
          await table.put(row);
          applied++;
        }
      }
      log.summary = `Dados recebidos: ${applied} novidades`;
      await database.importLogs.put(log);
    },
  );

  await updateSettings(
    { deviceMemberIndex: myIndex, lastSyncAt: new Date().toISOString(), onboarded: true },
    database,
  );
  return { applied, skipped, logId: log.id };
}
