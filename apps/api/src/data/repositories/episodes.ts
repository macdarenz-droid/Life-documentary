// Episodes on the server (P12): one per documentary and week, numbered from 1 in the order their weeks
// were first asked for. Rows are parsed with the contract on the way out. From its plan on, every state,
// plan or render change also writes a change-log row, so the phone pulls the episode's summary (P16).
import {
  Episode,
  EpisodePlanV1,
  EpisodeSummary,
  type EpisodeState,
  type LocalDate,
  type Timestamp,
  type Uuid,
} from '@life/contracts';
import { and, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { changeLog, costLedger, episodePlans, episodeRuns, episodes } from '../schema';

/** Drops SQL nulls: the contracts use absent fields, not nulls. */
function toEpisode(row: typeof episodes.$inferSelect): Episode {
  return Episode.parse(Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)));
}

/** The LocalDate six days after `weekStart`. */
function weekEndOf(weekStart: LocalDate): string {
  const end = new Date(`${weekStart}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10);
}

/**
 * The change-log row a phone pulls the episode by, written only once it has a plan, so a week that ends
 * empty never reaches a phone.
 */
function recordChange(db: Db, id: Uuid, now: Timestamp) {
  return db.insert(changeLog).select(
    db
      .select({
        // NULL takes the next `seq`.
        seq: sql<number>`NULL`.as('seq'),
        documentaryId: episodes.documentaryId,
        entity: sql<'episode'>`'episode'`.as('entity'),
        entityId: episodes.id,
        updatedAt: sql<string>`${now}`.as('updated_at'),
      })
      .from(episodes)
      .where(and(eq(episodes.id, id), gt(episodes.planVersion, 0))),
  );
}

export async function get(db: Db, id: Uuid): Promise<Episode | null> {
  const [row] = await db.select().from(episodes).where(eq(episodes.id, id)).limit(1);
  return row ? toEpisode(row) : null;
}

/**
 * The documentary's episode for this week; a new one is `scheduled` and numbered one past the
 * documentary's highest. Asking twice for the same week gives the same episode.
 */
export async function getOrCreate(
  db: Db,
  documentaryId: Uuid,
  weekStart: LocalDate,
  now: Timestamp,
): Promise<Episode> {
  // One statement, so two runs for the same week can neither both insert nor share a number.
  await db.run(sql`
    INSERT INTO ${episodes} (id, documentary_id, number, week_start, week_end, state, plan_version,
      render_version, cost_cents, updated_at)
    SELECT ${crypto.randomUUID()}, ${documentaryId}, COALESCE(MAX(${episodes.number}), 0) + 1,
      ${weekStart}, ${weekEndOf(weekStart)}, 'scheduled', 0, 0, 0, ${now}
    FROM ${episodes} WHERE ${episodes.documentaryId} = ${documentaryId}
    ON CONFLICT (documentary_id, week_start) DO NOTHING`);
  const [row] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.documentaryId, documentaryId), eq(episodes.weekStart, weekStart)))
    .limit(1);
  if (!row) throw new Error('The episode was not stored.');
  return toEpisode(row);
}

export async function setState(
  db: Db,
  id: Uuid,
  state: EpisodeState,
  now: Timestamp,
): Promise<void> {
  await db.batch([
    db.update(episodes).set({ state, updatedAt: now }).where(eq(episodes.id, id)),
    recordChange(db, id, now),
  ]);
}

export async function setCostCents(
  db: Db,
  id: Uuid,
  costCents: number,
  now: Timestamp,
): Promise<void> {
  await db.update(episodes).set({ costCents, updatedAt: now }).where(eq(episodes.id, id));
}

/** Points the episode at the plan it uses, with that plan's summary, and moves it on to `state`. */
export async function setPlan(
  db: Db,
  id: Uuid,
  plan: { version: number; summary: string; state: EpisodeState },
  now: Timestamp,
): Promise<void> {
  await db.batch([
    db
      .update(episodes)
      .set({ planVersion: plan.version, summary: plan.summary, state: plan.state, updatedAt: now })
      .where(eq(episodes.id, id)),
    recordChange(db, id, now),
  ]);
}

/** Points the episode at a finished 9:16 render; an older render version never replaces a newer one. */
export async function setRender(
  db: Db,
  id: Uuid,
  renderVersion: number,
  mp4Key: string,
  durationMs: number,
  now: Timestamp,
): Promise<void> {
  // One batch, so a replay never finds the render stored without its change-log row.
  await db.batch([
    db
      .update(episodes)
      .set({ renderVersion, mp4Key, durationMs, updatedAt: now })
      .where(and(eq(episodes.id, id), lt(episodes.renderVersion, renderVersion))),
    recordChange(db, id, now),
  ]);
}

/**
 * Publishes the episode: `ready` with its delivery time, only when it is not ready yet. Returns whether
 * this call moved it, so a replay never delivers twice.
 */
export async function setDelivered(db: Db, id: Uuid, now: Timestamp): Promise<boolean> {
  const [moved] = await db.batch([
    db
      .update(episodes)
      .set({ state: 'ready', deliveredAt: now, updatedAt: now })
      .where(and(eq(episodes.id, id), ne(episodes.state, 'ready')))
      .returning({ id: episodes.id }),
    recordChange(db, id, now),
  ]);
  return moved.length > 0;
}

/** The documentary's episode for this week, if there is one. */
export async function forWeek(
  db: Db,
  documentaryId: Uuid,
  weekStart: LocalDate,
): Promise<Episode | null> {
  const [row] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.documentaryId, documentaryId), eq(episodes.weekStart, weekStart)))
    .limit(1);
  return row ? toEpisode(row) : null;
}

/** Removes the episode with its plans and its ledger rows (a week with nothing to show, D2). */
export async function remove(db: Db, id: Uuid): Promise<void> {
  await db.batch([
    db.delete(episodePlans).where(eq(episodePlans.episodeId, id)),
    db.delete(costLedger).where(eq(costLedger.episodeId, id)),
    db.delete(episodes).where(eq(episodes.id, id)),
  ]);
}

/**
 * What a phone may know of these episodes (at most 90 ids): no storage keys, the title from the current
 * plan and `dueAt` from the week's run. An episode without a plan has no summary.
 */
export async function summaries(db: Db, ids: string[]): Promise<EpisodeSummary[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ episode: episodes, plan: episodePlans.plan, dueAt: episodeRuns.dueAt })
    .from(episodes)
    .innerJoin(
      episodePlans,
      and(eq(episodePlans.episodeId, episodes.id), eq(episodePlans.version, episodes.planVersion)),
    )
    .leftJoin(
      episodeRuns,
      and(
        eq(episodeRuns.documentaryId, episodes.documentaryId),
        eq(episodeRuns.weekStart, episodes.weekStart),
      ),
    )
    .where(inArray(episodes.id, ids));
  return rows.map(({ episode: e, plan, dueAt }) =>
    EpisodeSummary.parse({
      id: e.id,
      documentaryId: e.documentaryId,
      number: e.number,
      weekStart: e.weekStart,
      weekEnd: e.weekEnd,
      state: e.state,
      title: EpisodePlanV1.parse(JSON.parse(plan) as unknown).title,
      durationMs: e.durationMs ?? undefined,
      renderVersion: e.renderVersion,
      dueAt: dueAt ?? undefined,
      deliveredAt: e.deliveredAt ?? undefined,
      updatedAt: e.updatedAt,
    }),
  );
}
