// A synthetic year for the question engine (2027-01-01 → 2027-12-31). Pure: every value comes from the
// day's index, so the year is the same on every run. Seven lead-in days before 1 January carry moments,
// so the year does not start as if the person had been quiet.
import { Uuid, type LocalDate, type QuestionPick } from '@life/contracts';
import {
  addDays,
  daysBetween,
  pickQuestion,
  questionTemplates,
  type QuestionContext,
} from '../../src';

export const YEAR_START = '2027-01-01';
export const YEAR_END = '2027-12-31';
const LEAD_IN_DAYS = 7;

export const quietStretches = [
  { start: '2027-03-10', days: 4 },
  { start: '2027-06-01', days: 6 },
  { start: '2027-09-01', days: 10 },
] as const;

export const storylines = [
  {
    id: Uuid.parse('00000000-0000-4000-8000-000000000001'),
    title: 'The new job',
    openedOn: '2027-02-01',
    closedOn: '2027-06-30',
  },
  {
    id: Uuid.parse('00000000-0000-4000-8000-000000000002'),
    title: 'Training for the half marathon',
    openedOn: '2027-04-01',
    closedOn: '2027-10-15',
  },
] as const;

export const anniversaryDates: readonly LocalDate[] = [
  '2027-01-15',
  '2027-02-10',
  '2027-03-05',
  '2027-04-02',
  '2027-04-28',
  '2027-05-20',
  '2027-06-20',
  '2027-07-15',
  '2027-08-10',
  '2027-09-25',
  '2027-10-20',
  '2027-11-20',
];

const cast = ['maya', 'Ben', 'Aunt Rosa', 'Tom', 'Priya', 'Jonas'];
const newPlaces = Array.from({ length: 25 }, (_, k) => `Place ${String(k + 1).padStart(2, '0')}`);

export type SimDay = {
  date: LocalDate;
  momentCount: number;
  placeNames: string[];
  castNames: string[];
};

export function isQuietDay(date: LocalDate): boolean {
  return quietStretches.some((q) => {
    const offset = daysBetween(q.start, date);
    return offset >= 0 && offset < q.days;
  });
}

/** Every day from the lead-in to 31 December with its moments, places and cast. */
export function buildSimulatedYear(): SimDay[] {
  const first = addDays(YEAR_START, -LEAD_IN_DAYS);
  const total = daysBetween(first, YEAR_END) + 1;
  let placeIndex = 0;
  return Array.from({ length: total }, (_, i) => {
    const date = addDays(first, i);
    if (isQuietDay(date)) return { date, momentCount: 0, placeNames: [], castNames: [] };
    const placeNames = ['Home'];
    if (i % 7 < 5) placeNames.push('Office');
    // A new place about every two weeks from mid-January; a slot that falls on a quiet day moves to the next day.
    if (i >= 21 && placeIndex <= Math.floor((i - 21) / 14) && placeIndex < newPlaces.length) {
      placeNames.push(newPlaces[placeIndex++] ?? '');
    }
    const castNames =
      i % 5 === 2 ? [cast[i % cast.length] ?? '', cast[(i + 1) % cast.length] ?? ''] : [];
    return { date, momentCount: 1 + (i % 3), placeNames, castNames };
  });
}

/** Runs the engine for every day of 2027, feeding each pick back into the history. */
export function runSimulatedYear(seed: string): { date: LocalDate; pick: QuestionPick }[] {
  const days = buildSimulatedYear();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const history: QuestionContext['history'][number][] = [];
  const picks: { date: LocalDate; pick: QuestionPick }[] = [];
  for (let today = YEAR_START; today <= YEAR_END; today = addDays(today, 1)) {
    const recentDays = [1, 2, 3, 4, 5, 6, 7].flatMap((n) => byDate.get(addDays(today, -n)) ?? []);
    const windowStart = addDays(today, -7);
    const placesBefore = [
      ...new Set(days.filter((d) => d.date < windowStart).flatMap((d) => d.placeNames)),
    ];
    const openStorylines = storylines
      .filter((s) => s.openedOn <= today && today <= s.closedOn)
      .map(({ id, title, openedOn }) => ({ id, title, openedOn }));
    const pick = pickQuestion({
      today,
      seed,
      templates: questionTemplates,
      openStorylines,
      recentDays,
      placesBefore,
      momentsOneYearAgo: anniversaryDates.includes(today) ? 2 : 0,
      history,
    });
    history.push({
      askedOn: today,
      templateId: pick.templateId,
      ...(pick.storylineId ? { storylineId: pick.storylineId } : {}),
    });
    picks.push({ date: today, pick });
  }
  return picks;
}
