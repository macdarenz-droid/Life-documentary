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
