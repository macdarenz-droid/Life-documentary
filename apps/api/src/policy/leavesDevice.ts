// The shared rule for what may leave a phone (packages/story), applied again on the server before a row
// is accepted (CLAUDE.md rule 8). No one has Cloud backup until P23.
import type { Moment } from '@life/contracts';
import { leavesDevice } from '@life/story';

const ENTITLEMENT = { cloudBackup: false } as const;

/** Whether a moment's row may be stored on the server. */
export function momentRowMayLeave(moment: Moment): boolean {
  return leavesDevice(moment, ENTITLEMENT).row;
}
