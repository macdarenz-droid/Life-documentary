// Words on an episode's cards (P15, D41): the title card's label and dates, the closing card and the tease.
// Delivery (P16, D42): the push title, where this week's episode stands, and the notification channel.
import { dayAndMonth } from './recap';

/** "6pm", "9am", "noon" or "midnight" for an hour from 0 to 23. */
export function hourLabel(hour: number): string {
  if (hour === 0) return 'midnight';
  if (hour === 12) return 'noon';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

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
  ready: (n: number) => `Episode ${n} is ready`,
  making: (hour: number) =>
    `This week's episode is being made. It'll be here by ${hourLabel(hour)}.`,
  late: "This week's episode is running late.",
  failed: "This week's episode couldn't be made.",
  quiet: 'No episode this week.',
  offline: 'Plays offline',
  makingLabel: 'Being made',
  lateLabel: 'Running late',
  failedLabel: "Couldn't be made",
  channel: 'Episodes',
};
