// The only way a render reaches a stored file (P15, D41): a short-lived presigned URL, and only for a key
// under the documentary owner's own prefix.
import type { Uuid } from '@life/contracts';
import { presignGet } from '../../providers/r2/presign';
import type { Env } from '../../shared/env';
import { PRESIGN_SECONDS } from './settings';

export const KEY_NOT_ALLOWED = 'This file is not part of the documentary';

/** A presigned GET URL for `key`, which must lie under `u/{userId}/{documentaryId}/`. */
export async function mediaUrl(
  env: Pick<Env, 'R2_BUCKET' | 'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY'>,
  owner: { userId: Uuid; documentaryId: Uuid },
  key: string,
): Promise<string> {
  const prefix = `u/${owner.userId}/${owner.documentaryId}/`;
  if (!key.startsWith(prefix) || key.includes('..')) throw new Error(KEY_NOT_ALLOWED);
  return presignGet(env, key, PRESIGN_SECONDS);
}
