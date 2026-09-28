// Applied edits (P17, D43): one append-only row per edit, numbered by `seq` within the episode. The row
// and the plan version it made are written in one batch with the next `seq`, so two edits landing
// together clash on the unique key and only one is stored. Rows are parsed with the contract.
import { EditChange, EditOp, type LocalDate, type Timestamp, type Uuid } from '@life/contracts';
import { and, count, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../db';
import { episodeEdits } from '../schema';

export type StoredEdit = EditOp & {
  resultVersion: number;
  localDay: LocalDate;
  createdAt: Timestamp;
};

function toEdit(row: typeof episodeEdits.$inferSelect): StoredEdit {
  const { change, resultVersion, localDay, createdAt, ...rest } = row;
  return {
    ...EditOp.parse({ ...rest, op: EditChange.parse(JSON.parse(change) as unknown) }),
    resultVersion,
    localDay,
    createdAt,
  };
}

export async function get(db: Db, id: Uuid): Promise<StoredEdit | null> {
  const [row] = await db.select().from(episodeEdits).where(eq(episodeEdits.id, id)).limit(1);
  return row ? toEdit(row) : null;
}

/** How many edits were applied to the episode on this local day. */
export async function countOnDay(db: Db, episodeId: Uuid, localDay: LocalDate): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(episodeEdits)
    .where(and(eq(episodeEdits.episodeId, episodeId), eq(episodeEdits.localDay, localDay)));
  return row?.n ?? 0;
}

/** A batch item that stores the edit with the episode's next `seq`. */
export function insert(
  db: Db,
  edit: {
    id: Uuid;
    episodeId: Uuid;
    appliedToVersion: number;
    resultVersion: number;
    change: EditChange;
    localDay: LocalDate;
    createdAt: Timestamp;
  },
): BatchItem<'sqlite'> {
  const change = JSON.stringify(EditChange.parse(edit.change));
  return db.insert(episodeEdits).select(
    db
      .select({
        id: sql<string>`${edit.id}`.as('id'),
        episodeId: sql<string>`${edit.episodeId}`.as('episode_id'),
        seq: sql<number>`COALESCE(MAX(${episodeEdits.seq}), 0) + 1`.as('seq'),
        appliedToVersion: sql<number>`${edit.appliedToVersion}`.as('applied_to_version'),
        resultVersion: sql<number>`${edit.resultVersion}`.as('result_version'),
        change: sql<string>`${change}`.as('change'),
        localDay: sql<string>`${edit.localDay}`.as('local_day'),
        createdAt: sql<string>`${edit.createdAt}`.as('created_at'),
      })
      .from(episodeEdits)
      .where(eq(episodeEdits.episodeId, edit.episodeId)),
  );
}
