// Renders of episodes (P15, D41): one row per episode, render version and shape. Rows are parsed with the
// contract on the way in and on the way out; they go with their episode.
import { EpisodeRender, type Timestamp, type Uuid } from '@life/contracts';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { renders } from '../schema';

/** Drops SQL nulls: the contracts use absent fields, not nulls. */
function toRender(row: typeof renders.$inferSelect): EpisodeRender {
  return EpisodeRender.parse(Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)));
}

function toRow(render: EpisodeRender): typeof renders.$inferInsert {
  return {
    ...render,
    vendorRenderId: render.vendorRenderId ?? null,
    bucket: render.bucket ?? null,
    reason: render.reason ?? null,
    costMicroUsd: render.costMicroUsd ?? null,
    finishedAt: render.finishedAt ?? null,
  };
}

/** Stores the render, replacing the row with the same id. */
export async function put(db: Db, input: EpisodeRender): Promise<EpisodeRender> {
  const render = EpisodeRender.parse(input);
  const { id, ...rest } = toRow(render);
  await db
    .insert(renders)
    .values({ id, ...rest })
    .onConflictDoUpdate({ target: renders.id, set: rest });
  return render;
}

export async function get(db: Db, id: Uuid): Promise<EpisodeRender | null> {
  const [row] = await db.select().from(renders).where(eq(renders.id, id)).limit(1);
  return row ? toRender(row) : null;
}

/** Every render of the episode, oldest first. */
export async function forEpisode(db: Db, episodeId: Uuid): Promise<EpisodeRender[]> {
  const rows = await db
    .select()
    .from(renders)
    .where(eq(renders.episodeId, episodeId))
    .orderBy(asc(renders.startedAt), asc(renders.renderVersion));
  return rows.map(toRender);
}

type StateChange =
  | { state: 'starting' | 'rendering'; vendorRenderId?: string; bucket?: string }
  | { state: 'done'; costMicroUsd?: number; finishedAt: Timestamp }
  | { state: 'failed'; reason: string; finishedAt: Timestamp };

/** Moves the render on, keeping its other fields. */
export async function setState(db: Db, id: Uuid, change: StateChange): Promise<EpisodeRender> {
  const current = await get(db, id);
  if (!current) throw new Error('The render is gone.');
  return put(db, { ...current, ...change });
}
