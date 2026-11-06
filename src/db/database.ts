import Dexie, { type EntityTable } from 'dexie';
import type { Settings } from '../schemas/settings';

export type DuoDatabase = Dexie & {
  settings: EntityTable<Settings, 'id'>;
};

export function createDatabase(name = 'duo'): DuoDatabase {
  const db = new Dexie(name) as DuoDatabase;
  db.version(1).stores({
    settings: 'id',
  });
  return db;
}

export const db = createDatabase();
