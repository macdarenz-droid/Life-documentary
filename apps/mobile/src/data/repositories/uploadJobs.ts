import { UploadJob } from '@life/contracts';
import type { Timestamp, UploadPurpose } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, toValues, type Row, type TableSpec } from './table';

// A job is keyed by its asset and purpose (schema v4): one asset can go up for more than one reason.
export const uploadJobSpec: TableSpec<UploadJob> = {
  table: 'upload_jobs',
  key: 'assetId',
  contract: UploadJob,
  columns: {
    assetId: 'asset_id',
    purpose: 'purpose',
    state: 'state',
    uploadId: 'upload_id',
    bytesDone: 'bytes_done',
    attempts: 'attempts',
    nextAttemptAt: 'next_attempt_at',
    sourcePath: 'source_path',
    sourceWrappedKey: 'source_wrapped_key',
    updatedAt: 'updated_at',
  },
};

async function read(driver: SqlDriver, row: Row): Promise<UploadJob> {
  const parts = await driver.all<{ part_number: number; etag: string }>(
    `SELECT part_number, etag FROM upload_job_parts WHERE asset_id = ? AND purpose = ?
     ORDER BY part_number`,
    [row.asset_id ?? null, row.purpose ?? null],
  );
  return fromRow(uploadJobSpec, row, {
    parts: parts.map((p) => ({ partNumber: p.part_number, etag: p.etag })),
  });
}

/** Inserts or replaces a job and its parts in one transaction. A job needs its purpose. */
export async function put(driver: SqlDriver, job: UploadJob): Promise<UploadJob> {
  const parsed = UploadJob.parse(job);
  const purpose = parsed.purpose;
  if (purpose === undefined) throw new Error('An upload job needs its purpose');
  const { cols, vals } = toValues(uploadJobSpec, parsed);
  const updates = cols
    .filter((c) => c !== 'asset_id' && c !== 'purpose')
    .map((c) => `${c} = excluded.${c}`);
  return driver.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO upload_jobs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT (asset_id, purpose) DO UPDATE SET ${updates.join(', ')}`,
      vals,
    );
    await tx.run('DELETE FROM upload_job_parts WHERE asset_id = ? AND purpose = ?', [
      parsed.assetId,
      purpose,
    ]);
    for (const part of parsed.parts) {
      await tx.run(
        'INSERT INTO upload_job_parts (asset_id, purpose, part_number, etag) VALUES (?, ?, ?, ?)',
        [parsed.assetId, purpose, part.partNumber, part.etag],
      );
    }
    return parsed;
  });
}

/** The asset's job for `purpose`, or its first job when no purpose is given. */
/** Adds a new job (no parts yet) only when the asset has none for its purpose; whether it was added. */
export async function addIfAbsent(driver: SqlDriver, job: UploadJob): Promise<boolean> {
  const parsed = UploadJob.parse(job);
  if (parsed.purpose === undefined) throw new Error('An upload job needs its purpose');
  if (parsed.parts.length > 0) throw new Error('A new upload job has no parts');
  const { cols, vals } = toValues(uploadJobSpec, parsed);
  const { changes } = await driver.run(
    `INSERT INTO upload_jobs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT (asset_id, purpose) DO NOTHING`,
    vals,
  );
  return changes > 0;
}

export async function get(
  driver: SqlDriver,
  assetId: string,
  purpose?: UploadPurpose,
): Promise<UploadJob | undefined> {
  const row =
    purpose === undefined
      ? await driver.first<Row>(
          'SELECT * FROM upload_jobs WHERE asset_id = ? ORDER BY rowid LIMIT 1',
          [assetId],
        )
      : await driver.first<Row>('SELECT * FROM upload_jobs WHERE asset_id = ? AND purpose = ?', [
          assetId,
          purpose,
        ]);
  return row ? read(driver, row) : undefined;
}

/** Every job of the asset, whatever its purpose. */
export async function listForAsset(driver: SqlDriver, assetId: string): Promise<UploadJob[]> {
  const rows = await driver.all<Row>(
    'SELECT * FROM upload_jobs WHERE asset_id = ? ORDER BY rowid',
    [assetId],
  );
  const jobs: UploadJob[] = [];
  for (const row of rows) jobs.push(await read(driver, row));
  return jobs;
}

/** Removes the asset's jobs (only the one for `purpose` when given) and their parts. */
export async function remove(
  driver: SqlDriver,
  assetId: string,
  purpose?: UploadPurpose,
): Promise<void> {
  const where = purpose === undefined ? 'asset_id = ?' : 'asset_id = ? AND purpose = ?';
  const params = purpose === undefined ? [assetId] : [assetId, purpose];
  await driver.transaction(async (tx) => {
    await tx.run(`DELETE FROM upload_job_parts WHERE ${where}`, params);
    await tx.run(`DELETE FROM upload_jobs WHERE ${where}`, params);
  });
}

/** Pending or failed jobs whose next attempt is due (or unset), oldest first. */
export async function listDue(
  driver: SqlDriver,
  now: Timestamp,
  limit: number,
): Promise<UploadJob[]> {
  const rows = await driver.all<Row>(
    `SELECT * FROM upload_jobs WHERE state IN ('pending', 'failed')
     AND (next_attempt_at IS NULL OR julianday(next_attempt_at) <= julianday(?))
     ORDER BY updated_at, asset_id, purpose LIMIT ?`,
    [now, limit],
  );
  const jobs: UploadJob[] = [];
  for (const row of rows) jobs.push(await read(driver, row));
  return jobs;
}

/** Jobs a stopped run left mid-way (the app was killed) go back to pending; their parts are kept. */
export async function resetInterrupted(driver: SqlDriver): Promise<void> {
  await driver.run(
    "UPDATE upload_jobs SET state = 'pending' WHERE state IN ('uploading', 'completing')",
  );
}
