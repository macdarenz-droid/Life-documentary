import { z } from 'zod';

export const Uuid = z.uuid().brand<'Uuid'>();
export type Uuid = z.infer<typeof Uuid>;

function isRealDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const LocalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, { message: 'Date does not exist' });
export type LocalDate = z.infer<typeof LocalDate>;

/** An instant in UTC, ISO 8601 with a time and a trailing `Z` (no offsets). */
export const Timestamp = z.iso.datetime();
export type Timestamp = z.infer<typeof Timestamp>;

function isKnownTimeZone(timeZone: string): boolean {
  if (typeof Intl.supportedValuesOf === 'function') {
    if (Intl.supportedValuesOf('timeZone').includes(timeZone)) return true;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const IanaTimeZone = z
  .string()
  .min(1)
  .refine(isKnownTimeZone, { message: 'Unknown time zone' });
export type IanaTimeZone = z.infer<typeof IanaTimeZone>;
