import { openMemoryDriver } from '../sqlite/testing/memoryDriver';
import { migrate, migrations } from './index';
import { seedV1 } from './testing/seedV1';

const V1_TABLES = [
  'documentaries',
  'moments',
  'moment_storylines',
  'moment_cast',
  'media_assets',
  'questions',
  'storylines',
  'cast_members',
  'episodes',
  'upload_jobs',
  'upload_job_parts',
];

describe('migration v2 (settings)', () => {
  it('moves a seeded v1 database to v2, keeping every row and adding settings', async () => {
    const db = await seedV1();
    const before: Record<string, unknown[]> = {};
    for (const t of V1_TABLES) before[t] = await db.all(`SELECT * FROM ${t} ORDER BY rowid`);

    expect(await migrate(db, '2027-03-16T09:30:00Z', migrations)).toEqual({ from: 1, to: 2 });

    for (const t of V1_TABLES) {
      expect(await db.all(`SELECT * FROM ${t} ORDER BY rowid`)).toEqual(before[t]);
      expect(before[t]).toHaveLength(1);
    }
    expect(await db.all('SELECT * FROM settings')).toEqual([]);
    await db.run("INSERT INTO settings (key, value) VALUES ('k', 'v')");
    expect(await db.first('SELECT value FROM settings WHERE key = ?', ['k'])).toEqual({
      value: 'v',
    });
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect((await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(2);
  });

  it('brings a fresh database straight to v2', async () => {
    const db = await openMemoryDriver();
    expect(await migrate(db, '2027-03-16T09:30:00Z', migrations)).toEqual({ from: 0, to: 2 });
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
    );
    expect(tables).toEqual([{ name: 'settings' }]);
  });
});
