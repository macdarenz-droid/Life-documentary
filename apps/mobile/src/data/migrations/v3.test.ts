import { openMemoryDriver } from '../sqlite/testing/memoryDriver';
import { migrate } from './index';
import { seedV1, seedIds } from './testing/seedV1';
import { v1 } from './v1';
import { v2 } from './v2';
import { v3 } from './v3';

const V2_TABLES = [
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
  'settings',
];

async function seedV2() {
  const db = await seedV1();
  await migrate(db, '2027-03-16T09:30:00Z', [v1, v2]);
  await db.run("INSERT INTO settings (key, value) VALUES ('reminder', '{}')");
  return db;
}

describe('migration v3 (media asset posters)', () => {
  it('moves a seeded v2 database to v3, keeping every row and adding the two poster columns', async () => {
    const db = await seedV2();
    const before: Record<string, Record<string, unknown>[]> = {};
    for (const t of V2_TABLES) before[t] = await db.all(`SELECT * FROM ${t} ORDER BY rowid`);

    expect(await migrate(db, '2027-03-17T09:30:00Z', [v1, v2, v3])).toEqual({ from: 2, to: 3 });

    for (const t of V2_TABLES) {
      const after = await db.all<Record<string, unknown>>(`SELECT * FROM ${t} ORDER BY rowid`);
      expect(before[t]).toHaveLength(1);
      if (t === 'media_assets') {
        expect(after).toEqual(
          before[t]?.map((r) => ({ ...r, poster_path: null, poster_wrapped_key: null })),
        );
      } else {
        expect(after).toEqual(before[t]);
      }
    }
    await db.run('UPDATE media_assets SET poster_path = ?, poster_wrapped_key = ? WHERE id = ?', [
      'media/a.poster.lde',
      'cGs=',
      seedIds.asset,
    ]);
    expect(
      await db.first('SELECT poster_path, poster_wrapped_key FROM media_assets WHERE id = ?', [
        seedIds.asset,
      ]),
    ).toEqual({ poster_path: 'media/a.poster.lde', poster_wrapped_key: 'cGs=' });
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect((await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(3);
  });

  it('brings a fresh database straight to v3', async () => {
    const db = await openMemoryDriver();
    expect(await migrate(db, '2027-03-17T09:30:00Z', [v1, v2, v3])).toEqual({ from: 0, to: 3 });
    const columns = await db.all<{ name: string }>("PRAGMA table_info('media_assets')");
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['poster_path', 'poster_wrapped_key']),
    );
  });
});
