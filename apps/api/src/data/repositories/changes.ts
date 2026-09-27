// The change log (P6): one row per accepted change, numbered by `seq`. A phone's cursor is the highest
// `seq` it has seen; a pull returns each changed row once, at its latest `seq`.
import type { PulledEntity, Timestamp, Uuid } from '@life/contracts';
import { sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../db';
import { changeLog } from '../schema';

export type ChangedRow = { entity: PulledEntity; entityId: string; seq: number };

export function record(
  db: Db,
  documentaryId: Uuid,
  entity: PulledEntity,
  entityId: string,
  updatedAt: Timestamp,
): BatchItem<'sqlite'> {
  return db.insert(changeLog).values({ documentaryId, entity, entityId, updatedAt });
}

/**
 * Rows changed after `cursor` (all rows for null), oldest change first, at most `limit`, and the highest
 * `seq` of the documentary. The rows are read up to that `seq`, so a change written in between is left
 * for the next pull instead of being skipped.
 */
export async function since(
  db: Db,
  documentaryId: Uuid,
  cursor: number | null,
  limit: number,
): Promise<{ rows: ChangedRow[]; top: number | null }> {
  const [latest] = await db.all<{ top: number | null }>(sql`
    SELECT MAX(${changeLog.seq}) AS top FROM ${changeLog}
    WHERE ${changeLog.documentaryId} = ${documentaryId}`);
  const top = latest?.top ?? null;
  if (top === null) return { rows: [], top };
  const rows = await db.all<ChangedRow>(sql`
    SELECT ${changeLog.entity} AS entity, ${changeLog.entityId} AS entityId, MAX(${changeLog.seq}) AS seq
    FROM ${changeLog}
    WHERE ${changeLog.documentaryId} = ${documentaryId}
      AND ${changeLog.seq} > ${cursor ?? 0} AND ${changeLog.seq} <= ${top}
    GROUP BY ${changeLog.entity}, ${changeLog.entityId}
    ORDER BY seq
    LIMIT ${limit}`);
  return { rows, top };
}
