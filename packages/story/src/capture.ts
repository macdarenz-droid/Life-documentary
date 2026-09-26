// Product limits for capture (P5) and the small labels the Today screen shows.
import { dayAndMonth, recapWords } from './words/recap';

export const capture = { answerMinMs: 1000, answerMaxMs: 10000, libraryClipMaxMs: 60000 } as const;

/** "Saturday 26 September" for a LocalDate. */
export function dayLabel(date: string): string {
  return `${recapWords.weekday(date)} ${dayAndMonth(date)}`;
}

/** Whole seconds left of a recording, rounded up: 9,001 ms left reads 10. */
export function secondsLeft(elapsedMs: number, maxMs: number = capture.answerMaxMs): number {
  return Math.max(0, Math.ceil((maxMs - elapsedMs) / 1000));
}

/** "0:07" for a count of seconds. */
export function countdownLabel(seconds: number): string {
  return `0:${String(Math.max(0, Math.min(59, seconds))).padStart(2, '0')}`;
}
