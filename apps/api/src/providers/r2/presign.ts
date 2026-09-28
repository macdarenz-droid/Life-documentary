// Presigned GET URLs on R2's S3 endpoint (P15, D41), signed with aws4fetch. It only signs: the pipeline
// decides which keys may be shared and for how long.
import { AwsClient } from 'aws4fetch';
import type { Env } from '../../shared/env';

export const RENDERING_NOT_SET_UP = 'Rendering is not set up';

type R2Env = Pick<Env, 'R2_BUCKET' | 'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY'>;

/** A GET URL for `key` in the media bucket, valid for `expiresInSeconds`. */
export async function presignGet(
  env: R2Env,
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error(RENDERING_NOT_SET_UP);
  }
  const client = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
    retries: 0,
  });
  const path = key.split('/').map(encodeURIComponent).join('/');
  const url = new URL(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${path}`);
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await client.sign(url, { method: 'GET', aws: { signQuery: true } });
  return signed.url;
}
