import { Episode } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, selectRow, upsert, type Row, type TableSpec } from './table';

export const episodeSpec: TableSpec<Episode> = {
  table: 'episodes',
  key: 'id',
  contract: Episode,
  columns: {
    id: 'id',
    documentaryId: 'documentary_id',
    number: 'number',
    weekStart: 'week_start',
    weekEnd: 'week_end',
    state: 'state',
    planVersion: 'plan_version',
    renderVersion: 'render_version',
    mp4Key: 'mp4_key',
    posterKey: 'poster_key',
    durationMs: 'duration_ms',
    costCents: 'cost_cents',
    summary: 'summary',
    deliveredAt: 'delivered_at',
    updatedAt: 'updated_at',
  },
};

export async function put(driver: SqlDriver, episode: Episode): Promise<Episode> {
  return upsert(driver, episodeSpec, episode);
}

export async function get(driver: SqlDriver, id: string): Promise<Episode | undefined> {
  const row = await selectRow(driver, episodeSpec, id);
  return row ? fromRow(episodeSpec, row) : undefined;
}

/** The device's episode view: newest number first. */
export async function listRecent(
  driver: SqlDriver,
  documentaryId: string,
  limit: number,
): Promise<Episode[]> {
  const rows = await driver.all<Row>(
    'SELECT * FROM episodes WHERE documentary_id = ? ORDER BY number DESC LIMIT ?',
    [documentaryId, limit],
  );
  return rows.map((r) => fromRow(episodeSpec, r));
}
