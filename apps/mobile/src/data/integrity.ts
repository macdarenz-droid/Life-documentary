// A health check for the device database: SQLite's own integrity check, dangling foreign keys, and a
// contract parse of every stored row. Problems are reported, never thrown.
import type { FileIO, KeyStore } from '../domain/ports';
import { MASTER_KEY_NAME } from './fileStore/masterKey';
import * as castMembers from './repositories/castMembers';
import * as documentaries from './repositories/documentaries';
import * as episodes from './repositories/episodes';
import { CorruptRowError } from './repositories/errors';
import * as mediaAssets from './repositories/mediaAssets';
import * as moments from './repositories/moments';
import * as originalRequests from './repositories/originalRequests';
import * as questions from './repositories/questions';
import * as storylines from './repositories/storylines';
import * as uploadJobs from './repositories/uploadJobs';
import type { SqlDriver } from './sqlite/driver';

export type IntegrityProblem = {
  kind: 'sqlite' | 'foreignKey' | 'corruptRow' | 'missingFile' | 'orphanFile' | 'missingMasterKey';
  table?: string;
  id?: string;
  detail: string;
};
export type IntegrityReport = { ok: boolean; problems: IntegrityProblem[] };

const ENTITIES: {
  table: string;
  key: string;
  get: (driver: SqlDriver, id: string) => Promise<unknown>;
}[] = [
  { table: 'documentaries', key: 'id', get: documentaries.get },
  { table: 'media_assets', key: 'id', get: mediaAssets.get },
  { table: 'storylines', key: 'id', get: storylines.get },
  { table: 'cast_members', key: 'id', get: castMembers.get },
  { table: 'questions', key: 'id', get: questions.get },
  { table: 'moments', key: 'id', get: moments.get },
  { table: 'episodes', key: 'id', get: episodes.get },
  { table: 'upload_jobs', key: 'asset_id', get: uploadJobs.get },
  { table: 'original_requests', key: 'id', get: originalRequests.get },
];

export async function checkDatabase(driver: SqlDriver): Promise<IntegrityReport> {
  const problems: IntegrityProblem[] = [];

  const sqlite = await driver.all<{ integrity_check: string }>('PRAGMA integrity_check');
  for (const row of sqlite) {
    if (row.integrity_check !== 'ok')
      problems.push({ kind: 'sqlite', detail: row.integrity_check });
  }

  const dangling = await driver.all<{ table: string; rowid: number | null; parent: string }>(
    'PRAGMA foreign_key_check',
  );
  for (const fk of dangling) {
    const entity = ENTITIES.find((e) => e.table === fk.table);
    const id =
      entity && fk.rowid !== null
        ? (
            await driver.first<Record<string, string>>(
              `SELECT ${entity.key} AS id FROM ${fk.table} WHERE rowid = ?`,
              [fk.rowid],
            )
          )?.id
        : undefined;
    problems.push({
      kind: 'foreignKey',
      table: fk.table,
      ...(id !== undefined ? { id } : fk.rowid !== null ? { id: `rowid ${fk.rowid}` } : {}),
      detail: `points at a missing row in ${fk.parent}`,
    });
  }

  for (const entity of ENTITIES) {
    const ids = await driver.all<{ id: string }>(`SELECT ${entity.key} AS id FROM ${entity.table}`);
    for (const { id } of ids) {
      try {
        await entity.get(driver, id);
      } catch (error) {
        if (!(error instanceof CorruptRowError)) throw error;
        problems.push({
          kind: 'corruptRow',
          table: error.table,
          id: error.id,
          detail: error.message,
        });
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Compares the encrypted file store with the database: assets whose original or poster is gone (unless
 * all their moments are deleted), files no asset owns (originals and posters are owned),
 * and assets without the master key that unwraps them (iOS keeps Keychain items after an uninstall,
 * Android does not).
 */
export async function checkFiles(input: {
  driver: SqlDriver;
  io: FileIO;
  keyStore: KeyStore;
  storeDir: string;
}): Promise<IntegrityReport> {
  const { driver, io, keyStore, storeDir } = input;
  const problems: IntegrityProblem[] = [];
  const assets = await mediaAssets.listAll(driver);

  // An asset whose moments are all deleted may have lost its files already (delete removes them).
  const deleted = new Set(
    (
      await driver.all<{ id: string }>(
        `SELECT media_asset_id AS id FROM moments WHERE media_asset_id IS NOT NULL
         GROUP BY media_asset_id HAVING SUM(deleted_at IS NULL) = 0`,
      )
    ).map((r) => r.id),
  );

  for (const asset of assets) {
    if (deleted.has(asset.id)) continue;
    for (const path of [asset.localPath, asset.posterPath]) {
      if (path !== undefined && !(await io.exists(path))) {
        problems.push({
          kind: 'missingFile',
          table: 'media_assets',
          id: asset.id,
          detail: `${path} is missing`,
        });
      }
    }
  }

  const owned = new Set(
    assets.flatMap((a) => (a.posterPath ? [a.localPath, a.posterPath] : [a.localPath])),
  );
  for (const path of await io.list(storeDir)) {
    if (!owned.has(path)) problems.push({ kind: 'orphanFile', detail: `${path} has no asset` });
  }

  if (assets.length > 0 && (await keyStore.get(MASTER_KEY_NAME)) === null) {
    problems.push({
      kind: 'missingMasterKey',
      detail: `${assets.length} assets but no master key`,
    });
  }

  return { ok: problems.length === 0, problems };
}
