// The phone's episodes (P16, D42): the summaries the service sends down, pulled only, each with the path
// and render version of the copy downloaded for offline viewing, when there is one.
import { DeviceEpisode } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, selectRow, upsert, type Row, type TableSpec } from './table';

export const episodeSpec: TableSpec<DeviceEpisode> = {
  table: 'episodes',
  key: 'id',
  contract: DeviceEpisode,
  columns: {
    id: 'id',
    documentaryId: 'documentary_id',
    number: 'number',
    weekStart: 'week_start',
    weekEnd: 'week_end',
    state: 'state',
    title: 'title',
    durationMs: 'duration_ms',
    renderVersion: 'render_version',
    dueAt: 'due_at',
    deliveredAt: 'delivered_at',
    updatedAt: 'updated_at',
    localPath: 'local_path',
    localRenderVersion: 'local_render_version',
  },
};

export async function put(driver: SqlDriver, episode: DeviceEpisode): Promise<DeviceEpisode> {
  return upsert(driver, episodeSpec, episode);
}

export async function get(driver: SqlDriver, id: string): Promise<DeviceEpisode | undefined> {
  const row = await selectRow(driver, episodeSpec, id);
  return row ? fromRow(episodeSpec, row) : undefined;
}

/** The device's episode view: newest number first. */
export async function listRecent(
  driver: SqlDriver,
  documentaryId: string,
  limit: number,
): Promise<DeviceEpisode[]> {
  const rows = await driver.all<Row>(
    'SELECT * FROM episodes WHERE documentary_id = ? ORDER BY number DESC LIMIT ?',
    [documentaryId, limit],
  );
  return rows.map((r) => fromRow(episodeSpec, r));
}
