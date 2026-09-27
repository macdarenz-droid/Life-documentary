// The one rule for what may leave the phone (P6, D37). The phone calls it before a row goes into a sync
// payload and before an upload is queued; the server calls it again before it accepts a row or a part.
import type { MediaAsset, Moment } from '@life/contracts';

/** A moment and, when it has media, its asset's kind. */
export type LeavingMoment = Moment & { assetKind?: MediaAsset['kind'] };

export type LeavesDevice = {
  /** Whether the moment's row may sync. */
  row: boolean;
  /** Which file may upload: none, the answer as recorded, a small preview, or the full original. */
  media: 'none' | 'answer' | 'preview' | 'original';
};

/**
 * - `localOnly`: nothing leaves, not the row and not the media.
 * - Otherwise the row syncs. An answer uploads as recorded (the service needs its sound). A photo uploads
 *   a preview, or its original with Cloud backup. A library clip uploads nothing yet, or its original
 *   with Cloud backup. A note has no media.
 */
export function leavesDevice(
  moment: LeavingMoment,
  { cloudBackup }: { cloudBackup: boolean },
): LeavesDevice {
  if (moment.localOnly) return { row: false, media: 'none' };
  if (moment.mediaAssetId === undefined || moment.assetKind === undefined) {
    return { row: true, media: 'none' };
  }
  switch (moment.kind) {
    case 'answer':
      return { row: true, media: 'answer' };
    case 'photo':
      return { row: true, media: cloudBackup ? 'original' : 'preview' };
    case 'clip':
      return { row: true, media: cloudBackup ? 'original' : 'none' };
    case 'note':
      return { row: true, media: 'none' };
  }
}
