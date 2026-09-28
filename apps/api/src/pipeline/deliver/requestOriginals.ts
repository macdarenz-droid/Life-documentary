// Asking the phone for originals (P16, D42): for each photo or clip the plan uses that the rebuilt brief
// still has and whose original is not in R2, a request is opened; the phone learns of it through
// `/sync`. One silent push nudges it, carrying our own fixed word only.
import type { Episode } from '@life/contracts';
import * as documentaries from '../../data/repositories/documentaries';
import * as originalRequests from '../../data/repositories/originalRequests';
import { mediaKey } from '../../data/mediaKeys';
import { chosenMoments } from './chosen';
import type { DeliverContext } from './context';
import { pushTo } from './push';

export const ORIGINALS_PUSH = { type: 'originals' } as const;

/** Opens the requests the episode needs and returns how many are open. */
export async function requestOriginals(ctx: DeliverContext, episode: Episode): Promise<number> {
  const wanted = [];
  for (const { moment, asset } of await chosenMoments(ctx.db, episode)) {
    if (moment.kind !== 'photo' && moment.kind !== 'clip') continue;
    const key = mediaKey(asset.ownerUserId, episode.documentaryId, asset.id, 'original');
    if (await ctx.media.head(key)) continue;
    wanted.push({ documentaryId: episode.documentaryId, momentId: moment.id, assetId: asset.id });
  }
  const rows = await originalRequests.open(ctx.db, episode.id, wanted, ctx.clock.now());
  const opened = rows.filter((r) => r.state === 'open').length;
  if (opened > 0) {
    const documentary = await documentaries.get(ctx.db, episode.documentaryId);
    if (documentary) {
      await pushTo(ctx, documentary.ownerUserId, { data: { ...ORIGINALS_PUSH }, silent: true });
    }
  }
  return opened;
}
