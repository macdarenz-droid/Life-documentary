import { openMemoryDriver } from '../sqlite/testing/memoryDriver';
import { migrate, migrations } from './index';
import { SEED_NOW, seedIds, seedV1 } from './testing/seedV1';
import { v1 } from './v1';
import { v2 } from './v2';
import { v3 } from './v3';
import { v4 } from './v4';

const TABLES = [
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

async function seedV4() {
  const db = await seedV1();
  await migrate(db, '2027-03-17T09:30:00Z', [v1, v2, v3, v4]);
  await db.run("INSERT INTO settings (key, value) VALUES ('sync.cursor', '42')");
  await db.run("INSERT INTO settings (key, value) VALUES ('sync.pushedUpTo', ?)", [SEED_NOW]);
  await db.run("INSERT INTO settings (key, value) VALUES ('reminder.time', '20:00')");
  return db;
}

describe('migration v5 (derived text)', () => {
  it('adds the derived table, keeps every earlier row and clears only the pull cursor', async () => {
    const db = await seedV4();
    const before: Record<string, unknown[]> = {};
    for (const t of TABLES) before[t] = await db.all(`SELECT * FROM ${t} ORDER BY rowid`);

    expect(await migrate(db, '2027-03-18T09:30:00Z', migrations)).toEqual({ from: 4, to: 5 });

    for (const t of TABLES)
      expect(await db.all(`SELECT * FROM ${t} ORDER BY rowid`)).toEqual(before[t]);
    expect(await db.all('SELECT key, value FROM settings ORDER BY key')).toEqual([
      { key: 'reminder.time', value: '20:00' },
      { key: 'sync.pushedUpTo', value: SEED_NOW },
    ]);
    expect(await db.all('SELECT * FROM derived')).toEqual([]);
    expect((await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(5);
  });

  it('keeps one row per moment and provider', async () => {
    const db = await seedV4();
    await migrate(db, '2027-03-18T09:30:00Z', migrations);
    const insert = (id: string, provider: string) =>
      db.run(
        `INSERT INTO derived (id, moment_id, transcript, language, provider, model_version, produced_at)
         VALUES (?, ?, 'Hello.', 'en', ?, 'fixture-1', ?)`,
        [id, seedIds.moment, provider, SEED_NOW],
      );
    await insert('00000000-0000-4000-8000-0000000000d1', 'workersAi');
    await insert('00000000-0000-4000-8000-0000000000d2', 'anthropic');
    await expect(insert('00000000-0000-4000-8000-0000000000d3', 'workersAi')).rejects.toThrow();
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('brings a fresh database straight to v5', async () => {
    const db = await openMemoryDriver();
    expect(await migrate(db, '2027-03-18T09:30:00Z', migrations)).toEqual({ from: 0, to: 5 });
  });
});
