// Stored episode plans (P13, D39): one row per episode and version, the plan as JSON text. Rows are
// parsed with the contract on the way in and on the way out; they go with their episode. From P17 (D43)
// versions only grow: an edit or a revert inserts the next one, and a clash throws.
import { StoredPlan, type Uuid } from '@life/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../db';
import { episodePlans, episodes } from '../schema';

function toStored(row: typeof episodePlans.$inferSelect): StoredPlan {
  return StoredPlan.parse({ ...row, plan: JSON.parse(row.plan) as unknown });
}

/** Stores the plan, replacing the one with the same episode and version. */
export async function put(db: Db, input: StoredPlan): Promise<StoredPlan> {
  const stored = StoredPlan.parse(input);
  const row = { ...stored, plan: JSON.stringify(stored.plan) };
  await db
    .insert(episodePlans)
    .values(row)
    .onConflictDoUpdate({
      target: [episodePlans.episodeId, episodePlans.version],
      set: { plan: row.plan, createdBy: row.createdBy, createdAt: row.createdAt },
    });
  return stored;
}

/** The plan the episode uses (its `planVersion`), if it has one. */
export async function current(db: Db, episodeId: Uuid): Promise<StoredPlan | null> {
  const [row] = await db
    .select({ plan: episodePlans })
    .from(episodePlans)
    .innerJoin(
      episodes,
      and(eq(episodes.id, episodePlans.episodeId), eq(episodes.planVersion, episodePlans.version)),
    )
    .where(eq(episodePlans.episodeId, episodeId))
    .limit(1);
  return row ? toStored(row.plan) : null;
}

/**
 * A batch item that inserts the plan version, with no on-conflict clause, so a version that exists
 * throws. With `whileRun`, it inserts only while that re-cut run holds the episode's claim.
 */
export function insert(
  db: Db,
  input: StoredPlan,
  opts?: { whileRun: string },
): BatchItem<'sqlite'> {
  const stored = StoredPlan.parse(input);
  const row = { ...stored, plan: JSON.stringify(stored.plan) };
  if (!opts) return db.insert(episodePlans).values(row);
  // INSERT … SELECT from the episode's row while the run holds its claim: no row, nothing inserted.
  return db.insert(episodePlans).select(
    db
      .select({
        episodeId: sql<string>`${row.episodeId}`.as('episode_id'),
        version: sql<number>`${row.version}`.as('version'),
        plan: sql<string>`${row.plan}`.as('plan'),
        createdBy: sql<string>`${row.createdBy}`.as('created_by'),
        createdAt: sql<string>`${row.createdAt}`.as('created_at'),
      })
      .from(episodes)
      .where(and(eq(episodes.id, row.episodeId), eq(episodes.recutRun, opts.whileRun))),
  );
}

/** One version of the episode's plan, if it is stored. */
export async function get(db: Db, episodeId: Uuid, version: number): Promise<StoredPlan | null> {
  const [row] = await db
    .select()
    .from(episodePlans)
    .where(and(eq(episodePlans.episodeId, episodeId), eq(episodePlans.version, version)))
    .limit(1);
  return row ? toStored(row) : null;
}
