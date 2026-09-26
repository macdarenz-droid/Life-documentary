// The one rule for "may this moment's metadata leave the device" (ARCHITECTURE §7). P6's leavesDevice
// builds on it. Also the local calendar day of an instant, for a given IANA time zone.
import type { LocalDate, Moment, Timestamp } from '@life/contracts';

/** Not marked local-only and not deleted. */
export function isShareable(moment: Moment): boolean {
  return !moment.localOnly && moment.deletedAt === undefined;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day `timestamp` falls on in `timeZone`. */
export function localDay(timestamp: Timestamp, timeZone: string): LocalDate {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, format);
  }
  const parts = format.formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}
