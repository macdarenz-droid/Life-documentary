// Small labels the Footage screen shows (P10), and the note limit shared by capture and editing.
import { words } from './words';

/** A note is one line about a day: up to 280 characters, the same as the Note tray. */
export const NOTE_MAX_LENGTH = 280;

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** "09:41": the 24-hour clock time of `capturedAt` in the moment's own time zone. */
export function timeLabel(capturedAt: string, timeZone: string): string {
  let format = timeFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    timeFormatters.set(timeZone, format);
  }
  const parts = format.formatToParts(new Date(capturedAt));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('hour').padStart(2, '0')}:${part('minute').padStart(2, '0')}`;
}

function wholeSeconds(ms: number): number {
  return ms > 0 ? Math.max(1, Math.floor(ms / 1000)) : 0;
}

/** "0:09", "1:00": whole seconds, rounded down, never below 0:01 for a positive duration. */
export function durationLabel(ms: number): string {
  const seconds = wholeSeconds(ms);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** "9 seconds", "1 minute 5 seconds": the same whole seconds as durationLabel, as a person says them. */
export function durationWords(ms: number): string {
  const seconds = wholeSeconds(ms);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return words.footage.seconds(rest);
  return rest === 0
    ? words.footage.minutes(minutes)
    : `${words.footage.minutes(minutes)} ${words.footage.seconds(rest)}`;
}
