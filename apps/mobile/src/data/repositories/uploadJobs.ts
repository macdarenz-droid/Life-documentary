import { UploadJob } from '@life/contracts';
import type { Timestamp } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, selectRow, upsert, type Row, type TableSpec } from './table';

export const uploadJobSpec: TableSpec<UploadJob> = {
  table: 'upload_jobs',
  key: 'assetId',
  contract: UploadJob,
  columns: {
    assetId: 'asset_id',
    state: 'state',
    uploadId: 'upload_id',
    bytesDone: 'bytes_done',
    attempts: 'attempts',
    nextAttemptAt: 'next_attempt_at',
    updatedAt: 'updated_at',
  },
};

async function read(driver: SqlDriver, row: Row): Promise<UploadJob> {
  const parts = await driver.all<{ part_number: number; etag: string }>(
    'SELECT part_number, etag FROM upload_job_parts WHERE asset_id = ? ORDER BY part_number',
    [row.asset_id ?? null],
  );
  return fromRow(uploadJobSpec, row, {
    parts: parts.map((p) => ({ partNumber: p.part_number, etag: p.etag })),
  });
}

/** Inserts or replaces a job and its parts in one transaction. */
export async function put(driver: SqlDriver, job: UploadJob): Promise<UploadJob> {
  const parsed = UploadJob.parse(job);
  return driver.transaction(async (tx) => {
    await upsert(tx, uploadJobSpec, parsed);
    await tx.run('DELETE FROM upload_job_parts WHERE asset_id = ?', [parsed.assetId]);
    for (const part of parsed.parts) {
      await tx.run('INSERT INTO upload_job_parts (asset_id, part_number, etag) VALUES (?, ?, ?)', [
        parsed.assetId,
        part.partNumber,
        part.etag,
      ]);
    }
    return parsed;
  });
}

export async function get(driver: SqlDriver, assetId: string): Promise<UploadJob | undefined> {
  const row = await selectRow(driver, uploadJobSpec, assetId);
  return row ? read(driver, row) : undefined;
}

/** Removes a job and its parts; nothing when there is none. */
export async function remove(driver: SqlDriver, assetId: string): Promise<void> {
  await driver.transaction(async (tx) => {
    await tx.run('DELETE FROM upload_job_parts WHERE asset_id = ?', [assetId]);
    await tx.run('DELETE FROM upload_jobs WHERE asset_id = ?', [assetId]);
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
     ORDER BY updated_at, asset_id LIMIT ?`,
    [now, limit],
  );
  const jobs: UploadJob[] = [];
  for (const row of rows) jobs.push(await read(driver, row));
  return jobs;
}
