// The shared rule for what may leave a phone (packages/story), applied again on the server before a row
// is accepted (CLAUDE.md rule 8). No one has Cloud backup until P23.
import type { MediaAsset, Moment } from '@life/contracts';
import { leavesDevice, type LeavesDevice } from '@life/story';

const ENTITLEMENT = { cloudBackup: false } as const;

/** Whether a moment's row may be stored on the server. */
export function momentRowMayLeave(moment: Moment): boolean {
  return leavesDevice(moment, ENTITLEMENT).row;
}

/** Which file of a moment's media may be uploaded: none, the answer, a preview or the original. */
export function mediaMayLeave(
  moment: Moment,
  assetKind: MediaAsset['kind'],
): LeavesDevice['media'] {
  return leavesDevice({ ...moment, assetKind }, ENTITLEMENT).media;
}
