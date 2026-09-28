// The service's requests for originals on the phone (P16, D42): one row per episode and asset, pulled
// only. They say which full photos and clips to send; they never leave the phone.
import { OriginalRequest } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, toValues, type Row, type TableSpec } from './table';

export const originalRequestSpec: TableSpec<OriginalRequest> = {
  table: 'original_requests',
  key: 'id',
  contract: OriginalRequest,
  columns: {
    id: 'id',
    episodeId: 'episode_id',
    documentaryId: 'documentary_id',
    momentId: 'moment_id',
    assetId: 'asset_id',
    state: 'state',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
};

export async function put(driver: SqlDriver, row: OriginalRequest): Promise<OriginalRequest> {
  const parsed = OriginalRequest.parse(row);
  const { cols, vals } = toValues(originalRequestSpec, parsed);
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`);
  await driver.run(
    `INSERT INTO original_requests (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
    vals,
  );
  return parsed;
}

export async function get(driver: SqlDriver, id: string): Promise<OriginalRequest | undefined> {
  const row = await driver.first<Row>('SELECT * FROM original_requests WHERE id = ?', [id]);
  return row ? fromRow(originalRequestSpec, row) : undefined;
}

/** Every request, oldest first. */
export async function all(driver: SqlDriver): Promise<OriginalRequest[]> {
  const rows = await driver.all<Row>('SELECT * FROM original_requests ORDER BY created_at, id');
  return rows.map((row) => fromRow(originalRequestSpec, row));
}

/** The asset's requests, whatever their state. */
export async function forAsset(driver: SqlDriver, assetId: string): Promise<OriginalRequest[]> {
  const rows = await driver.all<Row>(
    'SELECT * FROM original_requests WHERE asset_id = ? ORDER BY created_at, id',
    [assetId],
  );
  return rows.map((row) => fromRow(originalRequestSpec, row));
}
