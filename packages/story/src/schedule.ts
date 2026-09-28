// When each weekly episode runs (P16, D42): the week an episode covers, when its run starts, renders
// and delivers in the documentary's time zone, which weeks are due, and how this week stands for the
// phone. Pure: `now` is always passed in; time-zone maths uses Intl.DateTimeFormat like `localDay`.
import type { Documentary, EpisodeState, LocalDate, Timestamp } from '@life/contracts';
import { addDays, dayOfWeek } from './dates';
import { localDay } from './shareable';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** How long after `deliverAt` a week can still start, and before the phone calls it quiet. */
const GRACE = 3 * HOUR;

export type ScheduledDocumentary = Pick<
  Documentary,
  'id' | 'timeZone' | 'episodeDay' | 'episodeHour'
>;

export type EpisodeWeek = { weekStart: LocalDate; weekEnd: LocalDate };

export type EpisodeTimes = { startAt: Timestamp; renderAt: Timestamp; deliverAt: Timestamp };

export type DueWeek = { documentaryId: string; deliveryDate: LocalDate } & EpisodeWeek &
  EpisodeTimes;

export type WeekStatus = 'none' | 'making' | 'ready' | 'late' | 'failed' | 'quiet';

/** What the phone knows of a week's episode once a plan is stored (the pulled summary). */
export type WeekSummary = { weekStart: LocalDate; state: EpisodeState };

/** An episode delivered on `deliveryDate` covers the seven days before it. */
export function episodeWeek(deliveryDate: LocalDate): EpisodeWeek {
  return { weekStart: addDays(deliveryDate, -7), weekEnd: addDays(deliveryDate, -1) };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The local wall-clock time of `ms` in `timeZone`, as milliseconds on a UTC axis. */
function wallMs(ms: number, timeZone: string): number {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, format);
  }
  const parts = format.formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour') % 24,
    part('minute'),
    part('second'),
  );
}

function offsetMs(ms: number, timeZone: string): number {
  return wallMs(ms, timeZone) - ms;
}

/**
 * The instant of local `date` at `hour`:00 in `timeZone`. A repeated local time (clocks going back)
 * takes its first occurrence. A local time that doesn't exist (clocks going forward) moves to the
 * first valid minute after it.
 */
function localInstant(date: LocalDate, hour: number, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y ?? NaN, (m ?? NaN) - 1, d ?? NaN, hour);
  const before = offsetMs(wall - DAY, timeZone);
  const after = offsetMs(wall + DAY, timeZone);
  const valid = [wall - before, wall - after].filter((t) => wallMs(t, timeZone) === wall);
  if (valid.length > 0) return Math.min(...valid);
  // In a gap: the first minute on the later offset is where the local clock starts again.
  let low = Math.floor((wall - after) / MINUTE);
  let high = Math.ceil((wall - before) / MINUTE);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsetMs(mid * MINUTE, timeZone) === after) high = mid;
    else low = mid + 1;
  }
  return low * MINUTE;
}

function timesMs(
  documentary: Pick<ScheduledDocumentary, 'timeZone' | 'episodeHour'>,
  deliveryDate: LocalDate,
): { startAt: number; renderAt: number; deliverAt: number } {
  const { timeZone, episodeHour } = documentary;
  const deliverAt = localInstant(deliveryDate, episodeHour, timeZone);
  const startAt =
    episodeHour < 7
      ? Math.max(localInstant(deliveryDate, 0, timeZone), deliverAt - HOUR)
      : localInstant(deliveryDate, 6, timeZone);
  const renderAt = Math.max(startAt, deliverAt - 15 * MINUTE);
  return { startAt, renderAt, deliverAt };
}

const iso = (ms: number): Timestamp => new Date(ms).toISOString();

/** When the run for the episode delivered on `deliveryDate` starts, renders and delivers (UTC). */
export function episodeTimes(
  documentary: Pick<ScheduledDocumentary, 'timeZone' | 'episodeHour'>,
  deliveryDate: LocalDate,
): EpisodeTimes {
  const t = timesMs(documentary, deliveryDate);
  return { startAt: iso(t.startAt), renderAt: iso(t.renderAt), deliverAt: iso(t.deliverAt) };
}

/** Every week whose run should be going at `now`: started, and not more than 3 hours past due. */
export function dueWeeks(
  documentaries: readonly ScheduledDocumentary[],
  now: Timestamp,
): DueWeek[] {
  const nowMs = Date.parse(now);
  const due: DueWeek[] = [];
  for (const documentary of documentaries) {
    const today = localDay(now, documentary.timeZone);
    for (const deliveryDate of [addDays(today, -1), today, addDays(today, 1)]) {
      if (dayOfWeek(deliveryDate) !== documentary.episodeDay) continue;
      const t = timesMs(documentary, deliveryDate);
      if (t.startAt <= nowMs && nowMs < t.deliverAt + GRACE) {
        due.push({
          documentaryId: documentary.id,
          deliveryDate,
          ...episodeWeek(deliveryDate),
          startAt: iso(t.startAt),
          renderAt: iso(t.renderAt),
          deliverAt: iso(t.deliverAt),
        });
      }
    }
  }
  return due;
}

/**
 * How the most recent week whose run has started stands at `now`. `none` before any week of this
 * documentary has started (a week that ended before the documentary was created doesn't count).
 * `summary` is the pulled episode for that week, if there is one.
 */
export function weekStatus(
  documentary: ScheduledDocumentary & Pick<Documentary, 'createdAt'>,
  now: Timestamp,
  summary?: WeekSummary,
): WeekStatus {
  const nowMs = Date.parse(now);
  const today = localDay(now, documentary.timeZone);
  const back = (dayOfWeek(today) - documentary.episodeDay + 7) % 7;
  let deliveryDate = addDays(today, -back);
  if (timesMs(documentary, deliveryDate).startAt > nowMs) deliveryDate = addDays(deliveryDate, -7);
  const week = episodeWeek(deliveryDate);
  if (week.weekEnd < localDay(documentary.createdAt, documentary.timeZone)) return 'none';

  const { deliverAt } = timesMs(documentary, deliveryDate);
  const mine = summary?.weekStart === week.weekStart ? summary : undefined;
  if (mine?.state === 'ready') return 'ready';
  if (mine?.state === 'failed') return 'failed';
  if (nowMs < deliverAt) return 'making';
  if (mine || nowMs < deliverAt + GRACE) return 'late';
  return 'quiet';
}
