import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';

const endsAfterStart = <T extends { startMs: number; endMs: number }>(t: T) => t.endMs > t.startMs;

/** One timed word of a transcript segment (word-level captions, DESIGN §4). */
export const TranscriptWord = z
  .object({
    text: z.string().min(1).max(60),
    startMs: z.number().int().min(0),
    endMs: z.number().int(),
  })
  .refine(endsAfterStart, { path: ['endMs'], message: 'A word ends after it starts' });
export type TranscriptWord = z.infer<typeof TranscriptWord>;

/** One timed stretch of a transcript, kept for captions (D40). */
export const TranscriptSegment = z
  .object({
    startMs: z.number().int().min(0),
    endMs: z.number().int(),
    text: z.string().min(1).max(500),
    words: z.array(TranscriptWord).max(60).optional(),
  })
  .refine(endsAfterStart, { path: ['endMs'], message: 'A segment ends after it starts' });
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

/**
 * What a model derived from one moment's media: a transcript, a caption, or both. One row per moment
 * and provider; deriving again replaces it and keeps its id.
 */
export const Derived = z
  .object({
    id: Uuid,
    momentId: Uuid,
    transcript: z.string().max(4000).optional(),
    segments: z.array(TranscriptSegment).max(200).optional(),
    caption: z.string().max(500).optional(),
    language: z.string().min(2).max(12),
    provider: z.enum(['workersAi', 'anthropic']),
    modelVersion: z.string().min(1),
    producedAt: Timestamp,
  })
  .refine((d) => d.transcript !== undefined || d.caption !== undefined, {
    message: 'A derived row has a transcript or a caption',
  });
export type Derived = z.infer<typeof Derived>;
