// The one rule for what may leave the phone (P6, D37). The phone calls it before a row goes into a sync
// payload and before an upload is queued; the server calls it again before it accepts a row or a part.
import type { MediaAsset, Moment, UploadPurpose } from '@life/contracts';

/** A moment and, when it has media, its asset's kind. */
export type LeavingMoment = Moment & { assetKind?: MediaAsset['kind'] };

export type LeavesDevice = {
  /** Whether the moment's row may sync. */
  row: boolean;
  /** Which files may upload, each for its purpose; empty when nothing goes up. */
  uploads: UploadPurpose[];
};

/**
 * - `localOnly`: nothing leaves, not the row and not the media.
 * - Otherwise the row syncs. An answer uploads as recorded (the service needs its sound), a video answer
 *   also a keyframe. A photo uploads a preview. A library clip uploads a keyframe. Cloud backup adds
 *   the original to a photo and a clip, never instead of their working copy. So does an open request
 *   for the asset (P16, D42): the episode's plan uses it. A note has no media.
 */
export function leavesDevice(
  moment: LeavingMoment,
  { cloudBackup, requested }: { cloudBackup: boolean; requested: boolean },
): LeavesDevice {
  if (moment.localOnly) return { row: false, uploads: [] };
  if (moment.mediaAssetId === undefined || moment.assetKind === undefined) {
    return { row: true, uploads: [] };
  }
  const original: UploadPurpose[] = cloudBackup || requested ? ['original'] : [];
  switch (moment.kind) {
    case 'answer':
      return {
        row: true,
        uploads: moment.assetKind === 'video' ? ['answer', 'keyframe'] : ['answer'],
      };
    case 'photo':
      return { row: true, uploads: ['preview', ...original] };
    case 'clip':
      return { row: true, uploads: ['keyframe', ...original] };
    case 'note':
      return { row: true, uploads: [] };
  }
}
