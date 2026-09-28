import { z } from 'zod';
import { LocalDate, Timestamp, Uuid } from '../ids';

const MS_PER_DAY = 86_400_000;

function utcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? NaN, (m ?? NaN) - 1, d ?? NaN);
}

/** True when `weekEnd` is exactly six days after `weekStart` (both LocalDate strings). */
export function isWeekSpan(weekStart: string, weekEnd: string): boolean {
  return utcMs(weekEnd) - utcMs(weekStart) === 6 * MS_PER_DAY;
}

export const EpisodeState = z.enum([
  'scheduled',
  'understanding',
  'planning',
  'narrating',
  'rendering',
  'ready',
  'failed',
  'recap',
]);
export type EpisodeState = z.infer<typeof EpisodeState>;

export const Episode = z
  .object({
    id: Uuid,
    documentaryId: Uuid,
    number: z.number().int().min(1),
    weekStart: LocalDate,
    weekEnd: LocalDate,
    state: EpisodeState,
    planVersion: z.number().int().min(0),
    renderVersion: z.number().int().min(0),
    mp4Key: z.string().min(1).optional(),
    posterKey: z.string().min(1).optional(),
    durationMs: z.number().int().min(1).optional(),
    costCents: z.number().int().min(0),
    summary: z.string().max(400).optional(),
    deliveredAt: Timestamp.optional(),
    updatedAt: Timestamp,
  })
  .refine((e) => isWeekSpan(e.weekStart, e.weekEnd), {
    path: ['weekEnd'],
    message: 'A week ends six days after it starts',
  });
export type Episode = z.infer<typeof Episode>;

const episodeSummaryFields = {
  id: Uuid,
  documentaryId: Uuid,
  number: z.number().int().min(1),
  weekStart: LocalDate,
  weekEnd: LocalDate,
  state: EpisodeState,
  /** The current plan's title. */
  title: z.string().min(1).max(60).optional(),
  durationMs: z.number().int().min(1).optional(),
  renderVersion: z.number().int().min(0),
  /** When the week's run is due (`episode_runs.dueAt`). */
  dueAt: Timestamp.optional(),
  deliveredAt: Timestamp.optional(),
  updatedAt: Timestamp,
};

const weekSpan = {
  path: ['weekEnd'],
  message: 'A week ends six days after it starts',
};

/**
 * What a phone learns of an episode (P16, D42): pulled only, once a plan is stored, without storage keys.
 * The video comes from `GET /episodes/:id/video`.
 */
export const EpisodeSummary = z
  .object(episodeSummaryFields)
  .refine((e) => isWeekSpan(e.weekStart, e.weekEnd), weekSpan);
export type EpisodeSummary = z.infer<typeof EpisodeSummary>;

/** An episode as the phone stores it: the summary with its downloaded copy, if there is one. */
export const DeviceEpisode = z
  .object({
    ...episodeSummaryFields,
    localPath: z.string().min(1).optional(),
    localRenderVersion: z.number().int().min(0).optional(),
  })
  .refine((e) => isWeekSpan(e.weekStart, e.weekEnd), weekSpan);
export type DeviceEpisode = z.infer<typeof DeviceEpisode>;
