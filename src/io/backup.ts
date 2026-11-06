import { db, readSettings, type DuoDatabase } from '../db/database';
import { stamp, updateSettings } from '../db/ops';
import { today } from '../domain/months';
import {
  ENTITY_SCHEMAS,
  type Attachment,
  type ChangeOp,
  type EntityTableName,
  type ImportLog,
} from '../schemas/entities';

const TABLES = Object.keys(ENTITY_SCHEMAS) as EntityTableName[];

export interface BackupFile {
  format: 'duo-backup';
  schemaVersion: 1;
  exportedAt: string;
  tables: Record<string, unknown[]>;
  settings: unknown;
}

function stampName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `duo-backup-${today().replace(/-/g, '')}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Soft-deleted rows go along: without their tombstones, a merge would bring deleted data back. */
export async function buildBackup(database: DuoDatabase = db): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = await database.table(t).toArray();
  return {
    format: 'duo-backup',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    tables,
    settings: await readSettings(database),
  };
}

export async function backupToFile(
  includeAttachments: boolean,
  database: DuoDatabase = db,
): Promise<File> {
  const backup = await buildBackup(database);
  const json = JSON.stringify(backup);
  const name = stampName();
  if (!includeAttachments) {
    return new File([json], `${name}.json`, { type: 'application/json' });
  }
  const { zipSync, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = { 'backup.json': strToU8(json) };
  const attachments = await database.attachments.toArray();
  const manifest: Omit<Attachment, 'blob'>[] = [];
  for (const { blob, ...meta } of attachments) {
    files[`attachments/${meta.id}`] = new Uint8Array(await blob.arrayBuffer());
    manifest.push(meta);
  }
  files['attachments.json'] = strToU8(JSON.stringify(manifest));
  return new File([zipSync(files, { level: 0 })], `${name}.zip`, { type: 'application/zip' });
}

export interface ParsedBackup {
  backup: BackupFile;
  attachments: Attachment[];
  errors: string[];
  counts: Record<string, number>;
}

function validate(backup: BackupFile): { errors: string[]; counts: Record<string, number> } {
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = backup.tables[t] ?? [];
    counts[t] = rows.length;
    rows.forEach((row, i) => {
      const parsed = ENTITY_SCHEMAS[t].safeParse(row);
      if (!parsed.success && errors.length < 10) {
        errors.push(
          `${t} #${i + 1}: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`,
        );
      }
    });
  }
  return { errors, counts };
}

export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  let backup: BackupFile;
  const attachments: Attachment[] = [];
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) {
    const { unzipSync, strFromU8 } = await import('fflate');
    const entries = unzipSync(bytes);
    if (!entries['backup.json']) throw new Error('Este zip não é um backup do app.');
    backup = JSON.parse(strFromU8(entries['backup.json'])) as BackupFile;
    const manifest = JSON.parse(
      strFromU8(entries['attachments.json'] ?? new Uint8Array([91, 93])),
    ) as Omit<Attachment, 'blob'>[];
    for (const meta of manifest) {
      const data = entries[`attachments/${meta.id}`];
      if (data) attachments.push({ ...meta, blob: new Blob([data.slice()], { type: meta.mime }) });
    }
  } else {
    try {
      backup = JSON.parse(new TextDecoder().decode(bytes)) as BackupFile;
    } catch {
      throw new Error('Este arquivo não é um backup válido.');
    }
  }
  if (backup?.format !== 'duo-backup' || backup.schemaVersion !== 1) {
    throw new Error('Este arquivo não é um backup do app.');
  }
  return { backup, attachments, ...validate(backup) };
}

export type RestoreMode = 'replace' | 'merge';

const everyTable = (database: DuoDatabase) => [
  ...TABLES.map((t) => database.table(t)),
  database.attachments,
  database.settings,
  database.importLogs,
];

export async function restoreBackup(
  { backup, attachments, errors }: ParsedBackup,
  mode: RestoreMode,
  database: DuoDatabase = db,
): Promise<{ written: number; skipped: number }> {
  if (errors.length > 0) throw new Error('O backup tem registros inválidos e não foi aplicado.');
  let written = 0;
  let skipped = 0;
  const inverseOps: ChangeOp[] = [];

  await database.transaction('rw', everyTable(database), async () => {
    if (mode === 'replace') {
      for (const t of TABLES) await database.table(t).clear();
      await database.attachments.clear();
      await database.importLogs.clear();
    }
    for (const t of TABLES) {
      const table = database.table(t);
      for (const row of (backup.tables[t] ?? []) as { id: string; updatedAt: string }[]) {
        const existing =
          mode === 'merge'
            ? ((await table.get(row.id)) as { updatedAt: string } | undefined)
            : undefined;
        // On merge, the most recent edit of each row wins.
        if (existing && existing.updatedAt >= row.updatedAt) {
          skipped++;
          continue;
        }
        if (mode === 'merge') inverseOps.push({ table: t, id: row.id, before: existing ?? null });
        await table.put(row);
        written++;
      }
    }
    if (attachments.length > 0) await database.attachments.bulkPut(attachments);
    if (mode === 'replace') await database.settings.put(backup.settings as never);
    const household = await database.households.toCollection().first();
    if (household && mode === 'merge') {
      const log: ImportLog = {
        ...stamp(household.id),
        kind: 'backup',
        appliedAt: new Date().toISOString(),
        summary: `Backup mesclado: ${written} registros atualizados`,
        inverseOps,
        undoneAt: null,
      };
      await database.importLogs.put(log);
    }
  });
  return { written, skipped };
}

export async function markBackupDone(database: DuoDatabase = db): Promise<void> {
  await updateSettings({ lastBackupAt: new Date().toISOString() }, database);
}
