import { Moment } from '@life/contracts';
import type { LocalDate, Timestamp } from '@life/contracts';
import { localDay } from '@life/story';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, selectRow, upsert, type Row, type TableSpec } from './table';

export const momentSpec: TableSpec<Moment> = {
  table: 'moments',
  key: 'id',
  contract: Moment,
  booleans: ['localOnly'],
  columns: {
    id: 'id',
    documentaryId: 'documentary_id',
    authorUserId: 'author_user_id',
    capturedAt: 'captured_at',
    timeZone: 'time_zone',
    kind: 'kind',
    questionId: 'question_id',
    mediaAssetId: 'media_asset_id',
    text: 'text',
    mood: 'mood',
    placeName: 'place_name',
    localOnly: 'local_only',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  },
};

async function read(driver: SqlDriver, row: Row): Promise<Moment> {
  const id = row.id as string;
  const storylines = await driver.all<{ storyline_id: string }>(
    'SELECT storyline_id FROM moment_storylines WHERE moment_id = ? ORDER BY rowid',
    [id],
  );
  const cast = await driver.all<{ cast_id: string }>(
    'SELECT cast_id FROM moment_cast WHERE moment_id = ? ORDER BY rowid',
    [id],
  );
  return fromRow(momentSpec, row, {
    storylineIds: storylines.map((s) => s.storyline_id),
    castIds: cast.map((c) => c.cast_id),
  });
}

/** Inserts or replaces a moment, its local day and its storyline and cast links, in one transaction. */
export async function put(driver: SqlDriver, moment: Moment): Promise<Moment> {
  const parsed = Moment.parse(moment);
  return driver.transaction(async (tx) => {
    await upsert(tx, momentSpec, parsed, {
      local_day: localDay(parsed.capturedAt, parsed.timeZone),
    });
    await tx.run('DELETE FROM moment_storylines WHERE moment_id = ?', [parsed.id]);
    await tx.run('DELETE FROM moment_cast WHERE moment_id = ?', [parsed.id]);
    for (const storylineId of parsed.storylineIds) {
      await tx.run('INSERT INTO moment_storylines (moment_id, storyline_id) VALUES (?, ?)', [
        parsed.id,
        storylineId,
      ]);
    }
    for (const castId of parsed.castIds) {
      await tx.run('INSERT INTO moment_cast (moment_id, cast_id) VALUES (?, ?)', [
        parsed.id,
        castId,
      ]);
    }
    return parsed;
  });
}

export async function get(driver: SqlDriver, id: string): Promise<Moment | undefined> {
  const row = await selectRow(driver, momentSpec, id);
  return row ? read(driver, row) : undefined;
}

/** Moments whose local day is in [fromDay, toDay], by capture time then id. */
export async function listByDays(
  driver: SqlDriver,
  documentaryId: string,
  fromDay: LocalDate,
  toDay: LocalDate,
  options: { includeDeleted?: boolean } = {},
): Promise<Moment[]> {
  const rows = await driver.all<Row>(
    `SELECT * FROM moments WHERE documentary_id = ? AND local_day BETWEEN ? AND ?
     ${options.includeDeleted ? '' : 'AND deleted_at IS NULL'} ORDER BY captured_at, id`,
    [documentaryId, fromDay, toDay],
  );
  const moments: Moment[] = [];
  for (const row of rows) moments.push(await read(driver, row));
  return moments;
}

export async function softDelete(
  driver: SqlDriver,
  id: string,
  now: Timestamp,
): Promise<Moment | undefined> {
  return driver.transaction(async (tx) => {
    const moment = await get(tx, id);
    if (!moment) return undefined;
    return put(tx, { ...moment, deletedAt: now, updatedAt: now });
  });
}
