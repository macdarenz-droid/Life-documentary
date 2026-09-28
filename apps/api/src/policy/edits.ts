// The edit limit (P17, D43): applied changes per episode per local day, in the documentary's time zone.
// Refused and stale changes don't count.
export const EDITS_PER_DAY = 10;

/** The changes left today after `countToday` applied ones. */
export function editsLeft(countToday: number): number {
  return Math.max(0, EDITS_PER_DAY - countToday);
}
