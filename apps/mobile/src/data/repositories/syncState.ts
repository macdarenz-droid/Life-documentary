// Sync state on the phone (P6, D37): the pull cursor and the push high-water mark in `settings`, and the
// rows changed since that mark. Times compare as instants (julianday), not as text, so `…00Z` and
// `…00.000Z` are the same moment.
import type {
  CastMember,
  Documentary,
  LocalDate,
  Moment,
  Question,
  Storyline,
} from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { castMemberSpec } from './castMembers';
import { documentarySpec } from './documentaries';
import * as moments from './moments';
import { questionSpec } from './questions';
import * as settings from './settings';
import { storylineSpec } from './storylines';
import { fromRow, type Row } from './table';

const CURSOR_KEY = 'sync.cursor';
const PUSHED_UP_TO_KEY = 'sync.pushedUpTo';

export type SyncState = { cursor: number | null; pushedUpTo: string | undefined };

export async function read(driver: SqlDriver): Promise<SyncState> {
  const cursor = await settings.get(driver, CURSOR_KEY);
  const pushedUpTo = await settings.get(driver, PUSHED_UP_TO_KEY);
  return { cursor: cursor === undefined ? null : Number(cursor), pushedUpTo };
}

/** Stores both marks in one transaction, so a round never leaves one without the other. */
export async function write(driver: SqlDriver, state: SyncState): Promise<void> {
  await driver.transaction(async (tx) => {
    if (state.cursor !== null) await settings.put(tx, CURSOR_KEY, String(state.cursor));
    if (state.pushedUpTo !== undefined) {
      await settings.put(tx, PUSHED_UP_TO_KEY, state.pushedUpTo);
    }
  });
}

function after(pushedUpTo: string | undefined): { sql: string; params: string[] } {
  return pushedUpTo === undefined
    ? { sql: '', params: [] }
    : { sql: 'AND julianday(updated_at) > julianday(?)', params: [pushedUpTo] };
}

/** The documentary row when it changed after `pushedUpTo`. */
export async function changedDocumentary(
  driver: SqlDriver,
  documentaryId: string,
  pushedUpTo: string | undefined,
): Promise<Documentary | undefined> {
  const since = after(pushedUpTo);
  const row = await driver.first<Row>(`SELECT * FROM documentaries WHERE id = ? ${since.sql}`, [
    documentaryId,
    ...since.params,
  ]);
  return row ? fromRow(documentarySpec, row) : undefined;
}

export async function changedStorylines(
  driver: SqlDriver,
  documentaryId: string,
  pushedUpTo: string | undefined,
): Promise<Storyline[]> {
  const since = after(pushedUpTo);
  const rows = await driver.all<Row>(
    `SELECT * FROM storylines WHERE documentary_id = ? ${since.sql} ORDER BY updated_at, id`,
    [documentaryId, ...since.params],
  );
  return rows.map((r) => fromRow(storylineSpec, r));
}

export async function changedCastMembers(
  driver: SqlDriver,
  documentaryId: string,
  pushedUpTo: string | undefined,
): Promise<CastMember[]> {
  const since = after(pushedUpTo);
  const rows = await driver.all<Row>(
    `SELECT * FROM cast_members WHERE documentary_id = ? ${since.sql} ORDER BY updated_at, id`,
    [documentaryId, ...since.params],
  );
  return rows.map((r) => fromRow(castMemberSpec, r));
}

/** Moments changed after `pushedUpTo`, tombstones included. */
export async function changedMoments(
  driver: SqlDriver,
  documentaryId: string,
  pushedUpTo: string | undefined,
): Promise<Moment[]> {
  const since = after(pushedUpTo);
  const rows = await driver.all<{ id: string }>(
    `SELECT id FROM moments WHERE documentary_id = ? ${since.sql} ORDER BY updated_at, id`,
    [documentaryId, ...since.params],
  );
  const list: Moment[] = [];
  for (const { id } of rows) {
    const moment = await moments.get(driver, id);
    if (moment) list.push(moment);
  }
  return list;
}

/**
 * Questions carry no `updatedAt`: every question asked on or after `fromDay` (all of them when it is
 * undefined).
 */
export async function questionsAskedFrom(
  driver: SqlDriver,
  documentaryId: string,
  fromDay: LocalDate | undefined,
): Promise<Question[]> {
  const rows = await driver.all<Row>(
    `SELECT * FROM questions WHERE documentary_id = ? ${fromDay ? 'AND asked_on >= ?' : ''}
     ORDER BY asked_on, id`,
    fromDay ? [documentaryId, fromDay] : [documentaryId],
  );
  return rows.map((r) => fromRow(questionSpec, r));
}

/**
 * Runs `fn` in one transaction whose foreign keys are checked at the commit, so pulled rows that point
 * at each other (a question and the moment that answers it) can land in any order.
 */
export async function applyPulled<T>(
  driver: SqlDriver,
  fn: (tx: SqlDriver) => Promise<T>,
): Promise<T> {
  return driver.transaction(async (tx) => {
    await tx.exec('PRAGMA defer_foreign_keys = ON');
    return fn(tx);
  });
}
