// Date arithmetic on LocalDate strings (YYYY-MM-DD). Pure: never reads the clock; Date objects are
// built only with Date.UTC, so no local time zone can shift a day.
import type { LocalDate } from '@life/contracts';

const MS_PER_DAY = 86_400_000;

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? NaN, m ?? NaN, d ?? NaN];
}

function toUtcMs(date: string): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): LocalDate {
  const date = new Date(ms);
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The date `n` days after `date` (before it when `n` is negative). */
export function addDays(date: string, n: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + n * MS_PER_DAY);
}

/** Whole days from `a` to `b` (b − a); negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

/** Saturday or Sunday. */
export function isWeekend(date: string): boolean {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
}

/** Same month and day one year earlier; 29 February maps to 28 February. */
export function oneYearBefore(date: string): LocalDate {
  const [y, m, d] = parts(date);
  const lastDayOfMonth = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return fromUtcMs(Date.UTC(y - 1, m - 1, Math.min(d, lastDayOfMonth)));
}
