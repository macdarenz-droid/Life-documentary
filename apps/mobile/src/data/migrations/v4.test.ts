import { openMemoryDriver } from '../sqlite/testing/memoryDriver';
import { migrate } from './index';
import { SEED_NOW, seedIds, seedV1 } from './testing/seedV1';
import { v1 } from './v1';
import { v2 } from './v2';
import { v3 } from './v3';
import { v4 } from './v4';

/** Up to this version only: later migrations have their own tests. */
const migrations = [v1, v2, v3, v4];

const OTHER_TABLES = [
  'documentaries',
  'moments',
  'moment_storylines',
  'moment_cast',
  'media_assets',
  'questions',
  'storylines',
  'cast_members',
  'episodes',
  'settings',
];
const PHOTO_ASSET = '00000000-0000-4000-8000-000000000013';
const PHOTO_MOMENT = '00000000-0000-4000-8000-000000000017';

/** v3 data: the seeded answer's job with a part, plus a photo whose job the old rule wrote. */
async function seedV3() {
  const db = await seedV1();
  await migrate(db, '2027-03-17T09:30:00Z', [v1, v2, v3]);
  await db.run(`INSERT INTO upload_job_parts (asset_id, part_number, etag) VALUES (?, 2, 'e2')`, [
    seedIds.asset,
  ]);
  await db.run(
    `INSERT INTO media_assets (id, owner_user_id, kind, width, height, bytes, sha256, local_path, wrapped_key, upload_state, created_at)
     VALUES (?, ?, 'photo', 4032, 3024, 2000000, ?, 'media/p.enc', 'a2V5', 'local', ?)`,
    [PHOTO_ASSET, seedIds.owner, 'b'.repeat(64), SEED_NOW],
  );
  await db.run(
    `INSERT INTO moments (id, documentary_id, author_user_id, captured_at, time_zone, local_day, kind, media_asset_id, local_only, updated_at)
     VALUES (?, ?, ?, ?, 'Europe/Berlin', '2027-03-15', 'photo', ?, 0, ?)`,
    [PHOTO_MOMENT, seedIds.documentary, seedIds.owner, SEED_NOW, PHOTO_ASSET, SEED_NOW],
  );
  await db.run(
    `INSERT INTO upload_jobs (asset_id, state, bytes_done, attempts, updated_at) VALUES (?, 'pending', 0, 0, ?)`,
    [PHOTO_ASSET, SEED_NOW],
  );
  await db.run(`INSERT INTO upload_job_parts (asset_id, part_number, etag) VALUES (?, 1, 'p1')`, [
    PHOTO_ASSET,
  ]);
  return db;
}

describe('migration v4 (upload jobs by purpose)', () => {
  it('keeps every answer job and part with purpose answer, drops the others, and keeps other rows', async () => {
    const db = await seedV3();
    const before: Record<string, Record<string, unknown>[]> = {};
    for (const t of OTHER_TABLES) before[t] = await db.all(`SELECT * FROM ${t} ORDER BY rowid`);
    const [answerJob] = await db.all<Record<string, unknown>>(
      'SELECT * FROM upload_jobs WHERE asset_id = ?',
      [seedIds.asset],
    );

    expect(await migrate(db, '2027-03-18T09:30:00Z', migrations)).toEqual({ from: 3, to: 4 });

    for (const t of OTHER_TABLES) {
      expect(await db.all(`SELECT * FROM ${t} ORDER BY rowid`)).toEqual(before[t]);
    }
    expect(await db.all('SELECT * FROM upload_jobs')).toEqual([
      { ...answerJob, purpose: 'answer', source_path: null, source_wrapped_key: null },
    ]);
    expect(await db.all('SELECT * FROM upload_job_parts ORDER BY asset_id, part_number')).toEqual([
      { asset_id: seedIds.asset, purpose: 'answer', part_number: 1, etag: 'e1' },
      { asset_id: seedIds.asset, purpose: 'answer', part_number: 2, etag: 'e2' },
    ]);
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect((await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(4);
  });

  it('lets one asset have a job per purpose and removes parts with their job', async () => {
    const db = await seedV3();
    await migrate(db, '2027-03-18T09:30:00Z', migrations);
    await db.run(
      `INSERT INTO upload_jobs (asset_id, purpose, state, bytes_done, attempts, updated_at)
       VALUES (?, 'preview', 'pending', 0, 0, ?)`,
      [seedIds.asset, SEED_NOW],
    );
    await expect(
      db.run(
        `INSERT INTO upload_jobs (asset_id, purpose, state, bytes_done, attempts, updated_at)
         VALUES (?, 'answer', 'pending', 0, 0, ?)`,
        [seedIds.asset, SEED_NOW],
      ),
    ).rejects.toThrow();
    await db.run("DELETE FROM upload_jobs WHERE asset_id = ? AND purpose = 'answer'", [
      seedIds.asset,
    ]);
    expect(await db.all('SELECT * FROM upload_job_parts')).toEqual([]);
    const indexes = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'upload_jobs'",
    );
    expect(indexes.map((i) => i.name)).toContain('upload_jobs_state_next');
  });

  it('brings a fresh database straight to v4', async () => {
    const db = await openMemoryDriver();
    expect(await migrate(db, '2027-03-18T09:30:00Z', migrations)).toEqual({ from: 0, to: 4 });
    const columns = await db.all<{ name: string }>("PRAGMA table_info('upload_jobs')");
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['purpose', 'source_path', 'source_wrapped_key']),
    );
  });
});
