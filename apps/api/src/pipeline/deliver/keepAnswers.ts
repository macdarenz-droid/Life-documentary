// Keeping the chosen answers (P16, D42). An answer is uploaded as recorded (D37), so its working copy is
// its original: for every answer the plan uses that the rebuilt brief still has, the working copy is
// copied R2 to R2 to the original's key before the working copies are deleted. Safe to run again.
import type { Episode, Uuid } from '@life/contracts';
import { mediaKey } from '../../data/mediaKeys';
import { chosenMoments } from './chosen';
import type { DeliverContext } from './context';

/** Copies each chosen answer's working copy to its original; returns the moment ids it kept. */
export async function keepAnswers(
  ctx: Pick<DeliverContext, 'db' | 'media'>,
  episode: Episode,
): Promise<Uuid[]> {
  const kept: Uuid[] = [];
  for (const { moment, asset } of await chosenMoments(ctx.db, episode)) {
    if (moment.kind !== 'answer') continue;
    const originalKey = mediaKey(asset.ownerUserId, episode.documentaryId, asset.id, 'original');
    if (await ctx.media.head(originalKey)) continue;
    const copy = await ctx.media.get(
      mediaKey(asset.ownerUserId, episode.documentaryId, asset.id, 'answer'),
    );
    if (!copy) continue;
    // Streamed, never held in memory; R2 needs the length of a streamed body.
    const { readable, writable } = new FixedLengthStream(copy.size);
    const piping = copy.body.pipeTo(writable);
    await ctx.media.put(originalKey, readable, {
      ...(copy.httpMetadata?.contentType
        ? { httpMetadata: { contentType: copy.httpMetadata.contentType } }
        : {}),
    });
    await piping;
    kept.push(moment.id);
  }
  return kept;
}
