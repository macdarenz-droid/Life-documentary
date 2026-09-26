import type { LocalDate, QuestionTemplate, Uuid } from '@life/contracts';

/** Everything the question engine needs to choose one day's question. Built by the caller. */
export type QuestionContext = {
  today: LocalDate;
  /** The documentary id; any non-empty string. */
  seed: string;
  /** Normally `questionTemplates`. */
  templates: readonly QuestionTemplate[];
  openStorylines: readonly { id: Uuid; title: string; openedOn: LocalDate }[];
  /** The 7 days before today, in any order; a missing day means no moments. */
  recentDays: readonly {
    date: LocalDate;
    momentCount: number;
    placeNames: readonly string[];
    castNames: readonly string[];
  }[];
  /** Distinct place names seen before the 7-day window. */
  placesBefore: readonly string[];
  /** Moments on `oneYearBefore(today)`. */
  momentsOneYearAgo: number;
  /** At least the last 60 days of asked questions. */
  history: readonly { askedOn: LocalDate; templateId: string; storylineId?: Uuid }[];
};
