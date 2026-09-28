import { migrate } from './index';
import { openMemoryDriver } from '../sqlite/testing/memoryDriver';
import { SEED_NOW, seedIds, seedV1 } from './testing/seedV1';
import { v1 } from './v1';
import { v2 } from './v2';
import { v3 } from './v3';
import { v4 } from './v4';
import { v5 } from './v5';
import { v6 } from './v6';

/** Up to this version only: later migrations have their own tests. */
const migrations = [v1, v2, v3, v4, v5, v6];

const TABLES = [
  'documentaries',
  'moments',
  'media_assets',
  'questions',
  'storylines',
  'cast_members',
  'episodes',
  'upload_jobs',
  'upload_job_parts',
  'derived',
];

async function seedV5() {
  const db = await seedV1();
  await migrate(db, '2027-03-17T09:30:00Z', [v1, v2, v3, v4, v5]);
  await db.run("INSERT INTO settings (key, value) VALUES ('sync.cursor', '42')");
  await db.run("INSERT INTO settings (key, value) VALUES ('sync.pushedUpTo', ?)", [SEED_NOW]);
  return db;
}

describe('migration v6 (original requests)', () => {
  it('adds original_requests, keeps every earlier row and clears only the pull cursor', async () => {
    const db = await seedV5();
    const before: Record<string, unknown[]> = {};
    for (const t of TABLES) before[t] = await db.all(`SELECT * FROM ${t} ORDER BY rowid`);

    expect(await migrate(db, '2027-03-21T09:30:00Z', migrations)).toEqual({ from: 5, to: 6 });

    for (const t of TABLES)
      expect(await db.all(`SELECT * FROM ${t} ORDER BY rowid`)).toEqual(before[t]);
    expect(await db.all('SELECT key, value FROM settings ORDER BY key')).toEqual([
      { key: 'sync.pushedUpTo', value: SEED_NOW },
    ]);
    await db.run(
      `INSERT INTO original_requests (id, episode_id, documentary_id, moment_id, asset_id, state, created_at, updated_at)
       VALUES ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000000e1', ?, ?, ?, 'open', ?, ?)`,
      [seedIds.documentary, seedIds.moment, seedIds.asset, SEED_NOW, SEED_NOW],
    );
    expect(await db.all('SELECT state FROM original_requests')).toEqual([{ state: 'open' }]);
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect((await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(6);
  });

  it('brings a fresh database straight to v6', async () => {
    const db = await openMemoryDriver();
    expect(await migrate(db, '2027-03-21T09:30:00Z', migrations)).toEqual({ from: 0, to: 6 });
  });
});
