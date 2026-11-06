import { createDatabase, type DuoDatabase } from './database';
import { readSettings, updateSettings } from './settingsRepo';

let database: DuoDatabase;

beforeEach(() => {
  database = createDatabase(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('settingsRepo', () => {
  it('devolve os padrões quando ainda não há nada salvo', async () => {
    const settings = await readSettings(database);
    expect(settings.theme).toBe('system');
    expect(settings.hideValues).toBe(false);
  });

  it('persiste só o que mudou e carimba updatedAt', async () => {
    await updateSettings({ theme: 'dark' }, database);
    await updateSettings({ hideValues: true }, database);

    const settings = await readSettings(database);
    expect(settings.theme).toBe('dark');
    expect(settings.hideValues).toBe(true);
    expect(new Date(settings.updatedAt).getTime()).toBeGreaterThan(0);
  });

  it('recusa valores fora do schema sem gravar nada', async () => {
    await expect(
      updateSettings({ theme: 'sepia' } as unknown as { theme: 'dark' }, database),
    ).rejects.toThrow();
    expect((await readSettings(database)).theme).toBe('system');
  });
});
