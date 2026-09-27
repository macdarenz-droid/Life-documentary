import { Storyline } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, selectRow, upsert, type Row, type TableSpec } from './table';

export const storylineSpec: TableSpec<Storyline> = {
  table: 'storylines',
  key: 'id',
  contract: Storyline,
  columns: {
    id: 'id',
    documentaryId: 'documentary_id',
    title: 'title',
    openedAt: 'opened_at',
    closedAt: 'closed_at',
    summary: 'summary',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  },
};

export async function put(driver: SqlDriver, storyline: Storyline): Promise<Storyline> {
  return upsert(driver, storylineSpec, storyline);
}

export async function get(driver: SqlDriver, id: string): Promise<Storyline | undefined> {
  const row = await selectRow(driver, storylineSpec, id);
  return row ? fromRow(storylineSpec, row) : undefined;
}

/** Storylines neither closed nor deleted, by when they opened. */
export async function listOpen(driver: SqlDriver, documentaryId: string): Promise<Storyline[]> {
  const rows = await driver.all<Row>(
    `SELECT * FROM storylines WHERE documentary_id = ? AND closed_at IS NULL AND deleted_at IS NULL
     ORDER BY opened_at, id`,
    [documentaryId],
  );
  return rows.map((r) => fromRow(storylineSpec, r));
}

/** Storylines not deleted, open or closed, by when they opened. */
export async function listLive(driver: SqlDriver, documentaryId: string): Promise<Storyline[]> {
  const rows = await driver.all<Row>(
    `SELECT * FROM storylines WHERE documentary_id = ? AND deleted_at IS NULL ORDER BY opened_at, id`,
    [documentaryId],
  );
  return rows.map((r) => fromRow(storylineSpec, r));
}
