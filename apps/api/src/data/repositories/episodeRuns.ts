// The record of each week's run (P16, D42): one row per documentary and week, written as each stage
// ends, so on-time delivery can be measured against VISION §9. D1 rows stay testable and queryable.
import type { LocalDate, Timestamp, Uuid } from '@life/contracts';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { episodeRuns } from '../schema';

export type EpisodeRun = typeof episodeRuns.$inferSelect;
export type RunKey = { documentaryId: Uuid; weekStart: LocalDate };
export type RunOutcome = NonNullable<EpisodeRun['outcome']>;

const where = (key: RunKey) =>
  and(eq(episodeRuns.documentaryId, key.documentaryId), eq(episodeRuns.weekStart, key.weekStart));

/** Opens the week's row; a replay keeps the first start time. */
export async function start(
  db: Db,
  key: RunKey,
  input: { episodeId: Uuid; startedAt: Timestamp; dueAt: Timestamp },
): Promise<void> {
  await db
    .insert(episodeRuns)
    .values({ ...key, ...input })
    .onConflictDoUpdate({
      target: [episodeRuns.documentaryId, episodeRuns.weekStart],
      set: { episodeId: input.episodeId, dueAt: input.dueAt },
    });
}

/** Opens the week's row when it has none, as a run that failed before its first step ended does. */
export async function ensure(
  db: Db,
  key: RunKey,
  input: { episodeId: Uuid | null; startedAt: Timestamp; dueAt: Timestamp },
): Promise<void> {
  await db
    .insert(episodeRuns)
    .values({ ...key, ...input })
    .onConflictDoNothing({ target: [episodeRuns.documentaryId, episodeRuns.weekStart] });
}

/** Writes when a stage ended. */
export async function mark(
  db: Db,
  key: RunKey,
  stage: Partial<
    Pick<
      EpisodeRun,
      'understoodAt' | 'plannedAt' | 'narratedAt' | 'renderStartedAt' | 'deliveredAt'
    >
  >,
): Promise<void> {
  await db.update(episodeRuns).set(stage).where(where(key));
}

/** How the run ended, with the originals asked for and received. */
export async function finish(
  db: Db,
  key: RunKey,
  input: {
    outcome: RunOutcome;
    episodeId: Uuid | null;
    originalsAsked: number;
    originalsReceived: number;
  },
): Promise<void> {
  await db.update(episodeRuns).set(input).where(where(key));
}

export async function get(db: Db, key: RunKey): Promise<EpisodeRun | null> {
  const [row] = await db.select().from(episodeRuns).where(where(key)).limit(1);
  return row ?? null;
}

/** Whether the week has a run row. */
export async function exists(db: Db, key: RunKey): Promise<boolean> {
  return (await get(db, key)) !== null;
}
