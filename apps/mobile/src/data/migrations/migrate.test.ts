import type { SqlDriver } from '../sqlite/driver';
import { openMemoryDriver } from '../sqlite/testing/memoryDriver';
import {
  DowngradeError,
  MigrationEditedError,
  MigrationListError,
  migrate,
  type Migration,
} from './index';
import { seedIds, seedV1 } from './testing/seedV1';
import { v1 } from './v1';

const NOW = '2027-03-15T09:30:00Z';
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
const INDEXES = ['moments_documentary_day', 'questions_documentary_day', 'upload_jobs_state_next'];

async function names(db: SqlDriver, type: 'table' | 'index'): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    'SELECT name FROM sqlite_master WHERE type = ? ORDER BY name',
    [type],
  );
  return rows.map((r) => r.name);
}
async function userVersion(db: SqlDriver): Promise<number> {
  return (await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? -1;
}
async function applied(db: SqlDriver): Promise<number[]> {
  return (
    await db.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')
  ).map((r) => r.version);
}

describe('migrate', () => {
  it('brings a fresh database to v1 with every table and index', async () => {
    const db = await openMemoryDriver();
    expect(await migrate(db, NOW, [v1])).toEqual({ from: 0, to: 1 });
    const tables = await names(db, 'table');
    for (const t of [...TABLES, 'schema_migrations']) expect(tables).toContain(t);
    const indexes = await names(db, 'index');
    for (const i of INDEXES) expect(indexes).toContain(i);
    expect(await userVersion(db)).toBe(1);
    expect(await applied(db)).toEqual([1]);
  });

  it('changes nothing on a second run', async () => {
    const db = await openMemoryDriver();
    await migrate(db, NOW, [v1]);
    const before = await db.all('SELECT * FROM schema_migrations');
    expect(await migrate(db, '2027-03-16T09:30:00Z', [v1])).toEqual({ from: 1, to: 1 });
    expect(await db.all('SELECT * FROM schema_migrations')).toEqual(before);
  });

  it('leaves the database at v1 when v2 fails midway', async () => {
    const db = await openMemoryDriver();
    await migrate(db, NOW, [v1]);
    const broken: Migration = {
      version: 2,
      name: 'broken',
      sql: 'CREATE TABLE v2_things (id TEXT PRIMARY KEY); INSERT INTO no_such_table VALUES (1);',
    };
    await expect(migrate(db, NOW, [v1, broken])).rejects.toThrow();
    expect(await names(db, 'table')).not.toContain('v2_things');
    expect(await applied(db)).toEqual([1]);
    expect(await userVersion(db)).toBe(1);
  });

  it('refuses a v1 whose SQL was edited after it was applied', async () => {
    const db = await openMemoryDriver();
    await migrate(db, NOW, [v1]);
    const edited = [{ ...v1, sql: `${v1.sql}\n-- edited` }];
    await expect(migrate(db, NOW, edited)).rejects.toBeInstanceOf(MigrationEditedError);
  });

  it('refuses to run a database at v3 with a two-step list', async () => {
    const db = await openMemoryDriver();
    const three: Migration[] = [
      v1,
      { version: 2, name: 'two', sql: 'CREATE TABLE two (id INTEGER)' },
      { version: 3, name: 'three', sql: 'CREATE TABLE three (id INTEGER)' },
    ];
    await migrate(db, NOW, three);
    await expect(migrate(db, NOW, three.slice(0, 2))).rejects.toBeInstanceOf(DowngradeError);
  });

  it('rejects a list with a gap before touching the database', async () => {
    const db = await openMemoryDriver();
    const gap: Migration[] = [
      v1,
      { version: 3, name: 'three', sql: 'CREATE TABLE three (id INTEGER)' },
    ];
    await expect(migrate(db, NOW, gap)).rejects.toBeInstanceOf(MigrationListError);
    expect(await names(db, 'table')).toEqual([]);
    expect(await userVersion(db)).toBe(0);
  });

  it('seeds a row in every v1 table without a foreign-key error', async () => {
    const db = await seedV1();
    for (const t of TABLES) {
      expect(await db.first<{ n: number }>(`SELECT count(*) AS n FROM ${t}`)).toEqual({ n: 1 });
    }
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('rejects an unknown moment kind', async () => {
    const db = await seedV1();
    await expect(
      db.run(
        `INSERT INTO moments (id, documentary_id, author_user_id, captured_at, time_zone, local_day, kind, local_only, updated_at)
         VALUES ('m2', ?, ?, ?, 'Europe/Berlin', '2027-03-15', 'voice', 0, ?)`,
        [seedIds.documentary, seedIds.owner, NOW, NOW],
      ),
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});
