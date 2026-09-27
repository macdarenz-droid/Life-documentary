// Episodes on the server (P12): one per documentary and week, numbered from 1 in the order their weeks
// were first asked for. Rows are parsed with the contract on the way out.
import {
  Episode,
  type EpisodeState,
  type LocalDate,
  type Timestamp,
  type Uuid,
} from '@life/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { costLedger, episodePlans, episodes } from '../schema';

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
  await db.update(episodes).set({ state, updatedAt: now }).where(eq(episodes.id, id));
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
  await db
    .update(episodes)
    .set({ planVersion: plan.version, summary: plan.summary, state: plan.state, updatedAt: now })
    .where(eq(episodes.id, id));
}

/** Removes the episode with its plans and its ledger rows (a week with nothing to show, D2). */
export async function remove(db: Db, id: Uuid): Promise<void> {
  await db.batch([
    db.delete(episodePlans).where(eq(episodePlans.episodeId, id)),
    db.delete(costLedger).where(eq(costLedger.episodeId, id)),
    db.delete(episodes).where(eq(episodes.id, id)),
  ]);
}
