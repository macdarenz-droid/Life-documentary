// Words on an episode's cards (P15, D41): the title card's label and dates, the closing card and the tease.
import { dayAndMonth } from './recap';

export const episodeWords = {
  label: (n: number) => `Episode ${n}`,
  /** "12 to 18 October", or "29 September to 5 October" when the months differ. */
  dates: (weekStart: string, weekEnd: string): string => {
    const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7);
    const first = sameMonth ? String(Number(weekStart.slice(8, 10))) : dayAndMonth(weekStart);
    return `${first} to ${dayAndMonth(weekEnd)}`;
  },
  closing: 'See you next week.',
  next: 'Next week',
};
