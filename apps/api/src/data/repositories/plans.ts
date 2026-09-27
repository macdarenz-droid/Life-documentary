// Stored episode plans (P13, D39): one row per episode and version, the plan as JSON text. Rows are
// parsed with the contract on the way in and on the way out; they go with their episode.
import { StoredPlan, type Uuid } from '@life/contracts';
import { and, eq } from 'drizzle-orm';
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
