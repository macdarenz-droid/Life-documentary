import { MediaAsset } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, selectRow, upsert, type Row, type TableSpec } from './table';

export const mediaAssetSpec: TableSpec<MediaAsset> = {
  table: 'media_assets',
  key: 'id',
  contract: MediaAsset,
  columns: {
    id: 'id',
    ownerUserId: 'owner_user_id',
    kind: 'kind',
    durationMs: 'duration_ms',
    width: 'width',
    height: 'height',
    bytes: 'bytes',
    sha256: 'sha256',
    localPath: 'local_path',
    wrappedKey: 'wrapped_key',
    posterPath: 'poster_path',
    posterWrappedKey: 'poster_wrapped_key',
    cloudKey: 'cloud_key',
    uploadState: 'upload_state',
    createdAt: 'created_at',
  },
};

export async function put(driver: SqlDriver, asset: MediaAsset): Promise<MediaAsset> {
  return upsert(driver, mediaAssetSpec, asset);
}

export async function get(driver: SqlDriver, id: string): Promise<MediaAsset | undefined> {
  const row = await selectRow(driver, mediaAssetSpec, id);
  return row ? fromRow(mediaAssetSpec, row) : undefined;
}

/** Every asset, oldest first; for the integrity check and the file store. */
export async function listAll(driver: SqlDriver): Promise<MediaAsset[]> {
  const rows = await driver.all<Row>('SELECT * FROM media_assets ORDER BY created_at, id');
  return rows.map((r) => fromRow(mediaAssetSpec, r));
}
