// Words for the recap episode (P11): the plan that needs no model and no narrator.
import { dayOfWeek } from '../dates';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Indexed by dayOfWeek: 0 = Sunday … 6 = Saturday. */
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** "14 September" for a LocalDate. */
export function dayAndMonth(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d ?? ''} ${MONTHS[(m ?? 1) - 1] ?? ''}`;
}

/** "March 2027" for a LocalDate. */
export function monthAndYear(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ''} ${y ?? ''}`;
}

export const recapWords = {
  title: (weekStart: string) => `The week of ${dayAndMonth(weekStart)}`,
  summary: (weekStart: string, weekEnd: string) =>
    `A recap of the week of ${dayAndMonth(weekStart)} to ${dayAndMonth(weekEnd)}.`,
  weekday: (date: string): string => WEEKDAYS[dayOfWeek(date)] ?? '',
  merged: (first: string, last: string) => `${first} to ${last}`,
};
