// The shared rule for what may leave a phone (packages/story), applied again on the server before a row
// is accepted (CLAUDE.md rule 8). No one has Cloud backup until P23; an open request for an asset (P16)
// lets its original in.
import type { MediaAsset, Moment, UploadPurpose } from '@life/contracts';
import { leavesDevice } from '@life/story';

const ENTITLEMENT = { cloudBackup: false } as const;

/** Whether a moment's row may be stored on the server. */
export function momentRowMayLeave(moment: Moment): boolean {
  return leavesDevice(moment, { ...ENTITLEMENT, requested: false }).row;
}

/**
 * The purposes a moment's media may be uploaded for; empty when nothing may. `requested` says the asset
 * has an open request for its original.
 */
export function uploadsAllowed(
  moment: Moment,
  assetKind: MediaAsset['kind'],
  { requested }: { requested: boolean },
): UploadPurpose[] {
  return leavesDevice({ ...moment, assetKind }, { ...ENTITLEMENT, requested }).uploads;
}
