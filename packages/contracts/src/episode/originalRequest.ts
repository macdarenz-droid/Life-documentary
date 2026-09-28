import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';

/**
 * The server asks a phone for the full photo or clip an episode's plan uses (P16, D42). Written only by
 * the server and pulled by the phone, like `derived`. `met` once the original arrived, `closed` when the
 * run no longer waits for it.
 */
export const OriginalRequestState = z.enum(['open', 'met', 'closed']);
export type OriginalRequestState = z.infer<typeof OriginalRequestState>;

export const OriginalRequest = z.object({
  id: Uuid,
  episodeId: Uuid,
  documentaryId: Uuid,
  momentId: Uuid,
  assetId: Uuid,
  state: OriginalRequestState,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type OriginalRequest = z.infer<typeof OriginalRequest>;
