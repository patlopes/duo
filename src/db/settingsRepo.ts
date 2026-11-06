import { DEFAULT_SETTINGS, SETTINGS_ID, SettingsSchema, type Settings } from '../schemas/settings';
import { db, type DuoDatabase } from './database';

/** Missing rows and rows saved by older versions both resolve to a complete, valid object. */
export async function readSettings(database: DuoDatabase = db): Promise<Settings> {
  const stored = await database.settings.get(SETTINGS_ID);
  return SettingsSchema.parse({
    updatedAt: new Date(0).toISOString(),
    ...DEFAULT_SETTINGS,
    ...stored,
  });
}

export async function updateSettings(
  patch: Partial<Omit<Settings, 'id' | 'updatedAt'>>,
  database: DuoDatabase = db,
): Promise<Settings> {
  return database.transaction('rw', database.settings, async () => {
    const next = SettingsSchema.parse({
      ...(await readSettings(database)),
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await database.settings.put(next);
    return next;
  });
}
