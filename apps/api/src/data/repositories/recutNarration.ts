// The characters each re-cut round spoke (P17, D43): one row per episode and plan version. Recording a
// version again replaces its count, so a replayed round never counts twice; the rows go with their episode.
import type { Uuid } from '@life/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { recutNarration } from '../schema';

/** Stores the characters spoken for this plan version, replacing an earlier count for it. */
export async function upsert(
  db: Db,
  episodeId: Uuid,
  planVersion: number,
  characters: number,
): Promise<void> {
  await db
    .insert(recutNarration)
    .values({ episodeId, planVersion, characters })
    .onConflictDoUpdate({
      target: [recutNarration.episodeId, recutNarration.planVersion],
      set: { characters },
    });
}

/** Every character the episode's re-cuts spoke. */
export async function total(db: Db, episodeId: Uuid): Promise<number> {
  const [row] = await db
    .select({ n: sql<number | null>`SUM(${recutNarration.characters})` })
    .from(recutNarration)
    .where(eq(recutNarration.episodeId, episodeId));
  return row?.n ?? 0;
}
