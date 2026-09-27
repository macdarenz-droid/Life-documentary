import { Documentary } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, selectRow, upsert, type Row, type TableSpec } from './table';

export const documentarySpec: TableSpec<Documentary> = {
  table: 'documentaries',
  key: 'id',
  contract: Documentary,
  columns: {
    id: 'id',
    ownerUserId: 'owner_user_id',
    title: 'title',
    kind: 'kind',
    timeZone: 'time_zone',
    episodeDay: 'episode_day',
    episodeHour: 'episode_hour',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
};

export async function put(driver: SqlDriver, documentary: Documentary): Promise<Documentary> {
  return upsert(driver, documentarySpec, documentary);
}

export async function get(driver: SqlDriver, id: string): Promise<Documentary | undefined> {
  const row = await selectRow(driver, documentarySpec, id);
  return row ? fromRow(documentarySpec, row) : undefined;
}

/** Every documentary on this device, oldest first. */
export async function listAll(driver: SqlDriver): Promise<Documentary[]> {
  const rows = await driver.all<Row>('SELECT * FROM documentaries ORDER BY created_at, id');
  return rows.map((r) => fromRow(documentarySpec, r));
}

/**
 * Hands a documentary to its account owner (the first link): the row, and the placeholder owner id on
 * its moments (their updatedAt moves to the documentary's) and on those moments' media, in one
 * transaction.
 */
export async function takeOwner(
  driver: SqlDriver,
  documentary: Documentary,
  placeholder: string,
): Promise<Documentary> {
  const parsed = Documentary.parse(documentary);
  return driver.transaction(async (tx) => {
    await upsert(tx, documentarySpec, parsed);
    await tx.run(
      `UPDATE media_assets SET owner_user_id = ?
       WHERE owner_user_id = ?
         AND id IN (SELECT media_asset_id FROM moments WHERE documentary_id = ?)`,
      [parsed.ownerUserId, placeholder, parsed.id],
    );
    await tx.run(
      `UPDATE moments SET author_user_id = ?, updated_at = ?
       WHERE documentary_id = ? AND author_user_id = ?`,
      [parsed.ownerUserId, parsed.updatedAt, parsed.id, placeholder],
    );
    return parsed;
  });
}
