import { openMemoryDriver } from '../sqlite/testing/memoryDriver';
import * as episodes from '../repositories/episodes';
import { migrate, migrations } from './index';
import { SEED_NOW, seedIds, seedV1 } from './testing/seedV1';
import { v1 } from './v1';
import { v2 } from './v2';
import { v3 } from './v3';
import { v4 } from './v4';
import { v5 } from './v5';
import { v6 } from './v6';

const TABLES = [
  'documentaries',
  'moments',
  'media_assets',
  'questions',
  'storylines',
  'cast_members',
  'upload_jobs',
  'upload_job_parts',
  'derived',
  'original_requests',
  'settings',
];

async function seedV6() {
  const db = await seedV1();
  await migrate(db, '2027-03-17T09:30:00Z', [v1, v2, v3, v4, v5, v6]);
  await db.run("INSERT INTO settings (key, value) VALUES ('sync.cursor', '42')");
  await db.run(
    `INSERT INTO original_requests (id, episode_id, documentary_id, moment_id, asset_id, state, created_at, updated_at)
     VALUES ('00000000-0000-4000-8000-0000000001a1', ?, ?, ?, ?, 'open', ?, ?)`,
    [seedIds.episode, seedIds.documentary, seedIds.moment, seedIds.asset, SEED_NOW, SEED_NOW],
  );
  return db;
}

describe('migration v7 (episode summaries)', () => {
  it('rebuilds episodes as summaries, keeping the earlier episode and every other row', async () => {
    const db = await seedV6();
    const before: Record<string, unknown[]> = {};
    for (const t of TABLES) before[t] = await db.all(`SELECT * FROM ${t} ORDER BY rowid`);

    expect(await migrate(db, '2027-03-21T09:30:00Z', migrations)).toEqual({ from: 6, to: 7 });

    for (const t of TABLES)
      expect(await db.all(`SELECT * FROM ${t} ORDER BY rowid`)).toEqual(before[t]);
    expect(await episodes.get(db, seedIds.episode)).toEqual({
      id: seedIds.episode,
      documentaryId: seedIds.documentary,
      number: 1,
      weekStart: '2027-03-08',
      weekEnd: '2027-03-14',
      state: 'ready',
      renderVersion: 1,
      updatedAt: SEED_NOW,
    });
    const kept = await episodes.get(db, seedIds.episode);
    await episodes.put(db, { ...kept!, localPath: 'episodes/e1.bin', localRenderVersion: 1 });
    expect(await episodes.get(db, seedIds.episode)).toMatchObject({
      localPath: 'episodes/e1.bin',
      localRenderVersion: 1,
    });
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect((await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(7);
  });

  it('brings a fresh database straight to v7', async () => {
    const db = await openMemoryDriver();
    expect(await migrate(db, '2027-03-21T09:30:00Z', migrations)).toEqual({ from: 0, to: 7 });
  });
});
