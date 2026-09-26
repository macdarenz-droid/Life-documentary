// Brings a database to the newest schema. Each step is exclusive and all-or-nothing; the harness refuses
// downgrades and detects an edited past step by its checksum.
import type { Timestamp } from '@life/contracts';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { SqlDriver } from '../sqlite/driver';
import type { Migration } from './types';

export class MigrationListError extends Error {
  override name = 'MigrationListError';
}
export class MigrationEditedError extends Error {
  override name = 'MigrationEditedError';
}
export class DowngradeError extends Error {
  override name = 'DowngradeError';
}

export function migrationChecksum(sql: string): string {
  return bytesToHex(sha256(utf8ToBytes(sql)));
}

function validateList(list: readonly Migration[]): void {
  list.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new MigrationListError(
        `Migration at position ${i} has version ${m.version}, expected ${i + 1}`,
      );
    }
    if (m.name.trim().length === 0)
      throw new MigrationListError(`Migration ${m.version} has no name`);
  });
}

const HISTORY_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

export async function migrate(
  driver: SqlDriver,
  now: Timestamp,
  list: readonly Migration[],
): Promise<{ from: number; to: number }> {
  validateList(list);
  await driver.exec(HISTORY_TABLE);

  const version =
    (await driver.first<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  const last = list.length;
  if (version > last)
    throw new DowngradeError(`The database is at v${version}; this app knows up to v${last}`);

  const applied = await driver.all<{ version: number; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version',
  );
  for (const row of applied) {
    const known = list[row.version - 1];
    if (known && migrationChecksum(known.sql) !== row.checksum) {
      throw new MigrationEditedError(`Migration ${row.version} was edited after it was applied`);
    }
  }

  for (const m of list.slice(version)) {
    await driver.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.run(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        [m.version, m.name, migrationChecksum(m.sql), now],
      );
      // user_version takes no bound parameter; the version is an integer from the validated list.
      await tx.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`);
    });
  }
  return { from: version, to: Math.max(version, last) };
}
