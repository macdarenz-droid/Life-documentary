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
