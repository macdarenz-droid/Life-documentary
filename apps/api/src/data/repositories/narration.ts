// Stored narrator clips (P14, D40): one row per episode, plan version and line, the words as JSON text.
// Rows are parsed with the contract on the way in and on the way out; they go with their episode.
import { NarrationClip, type Uuid } from '@life/contracts';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { narrationClips } from '../schema';

function toClip(row: typeof narrationClips.$inferSelect): NarrationClip {
  return NarrationClip.parse({
    ...row,
    sceneIndex: row.sceneIndex ?? undefined,
    words: JSON.parse(row.words) as unknown,
  });
}

/** Stores the clip, replacing the one with the same episode, plan version and index. */
export async function put(db: Db, input: NarrationClip): Promise<NarrationClip> {
  const clip = NarrationClip.parse(input);
  const row = { ...clip, sceneIndex: clip.sceneIndex ?? null, words: JSON.stringify(clip.words) };
  await db
    .insert(narrationClips)
    .values(row)
    .onConflictDoUpdate({
      target: [narrationClips.episodeId, narrationClips.planVersion, narrationClips.index],
      set: {
        kind: row.kind,
        sceneIndex: row.sceneIndex,
        text: row.text,
        voiceId: row.voiceId,
        key: row.key,
        hash: row.hash,
        durationMs: row.durationMs,
        words: row.words,
        kept: row.kept,
        createdAt: row.createdAt,
      },
    });
  return clip;
}

/** The clips of one plan version, by line index. */
export async function forEpisode(
  db: Db,
  episodeId: Uuid,
  planVersion: number,
): Promise<NarrationClip[]> {
  const rows = await db
    .select()
    .from(narrationClips)
    .where(
      and(eq(narrationClips.episodeId, episodeId), eq(narrationClips.planVersion, planVersion)),
    )
    .orderBy(asc(narrationClips.index));
  return rows.map(toClip);
}

/** A stored clip of this episode with this hash, from any plan version. */
export async function byHash(db: Db, episodeId: Uuid, hash: string): Promise<NarrationClip | null> {
  const [row] = await db
    .select()
    .from(narrationClips)
    .where(and(eq(narrationClips.episodeId, episodeId), eq(narrationClips.hash, hash)))
    .limit(1);
  return row ? toClip(row) : null;
}

/** Marks the clips of one plan version kept when their index is listed, and not kept otherwise. */
export async function setKept(
  db: Db,
  episodeId: Uuid,
  planVersion: number,
  indices: readonly number[],
): Promise<void> {
  const keep = new Set(indices);
  for (const clip of await forEpisode(db, episodeId, planVersion)) {
    await db
      .update(narrationClips)
      .set({ kept: keep.has(clip.index) })
      .where(
        and(
          eq(narrationClips.episodeId, episodeId),
          eq(narrationClips.planVersion, planVersion),
          eq(narrationClips.index, clip.index),
        ),
      );
  }
}
