// The R2 key of an asset's file for one purpose (D37). Working copies (answer, preview, keyframe) live
// under `tmp/` so a lifecycle rule can delete them by prefix; only an original lives under `u/`. The
// upload routes and the pipeline both take keys from here.
import type { UploadPurpose } from '@life/contracts';

export function mediaKey(
  userId: string,
  documentaryId: string,
  assetId: string,
  purpose: UploadPurpose,
): string {
  const prefix = purpose === 'original' ? 'u' : 'tmp';
  return `${prefix}/${userId}/${documentaryId}/${assetId}/${purpose}`;
}

/** The R2 key of a narrator clip (P14, D40), under `u/` so the `tmp/` rule never touches it. */
export function narrationKey(
  userId: string,
  documentaryId: string,
  episodeId: string,
  hash: string,
): string {
  return `u/${userId}/${documentaryId}/narration/${episodeId}/${hash}.mp3`;
}
