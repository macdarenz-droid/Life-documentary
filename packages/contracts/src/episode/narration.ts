import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';

/** One line the narrator speaks (P14, D40): a scene bridge or the tease, in plan order from 0. */
export const NarrationLine = z.object({
  index: z.number().int().min(0),
  kind: z.enum(['bridge', 'tease']),
  sceneIndex: z.number().int().min(0).optional(),
  text: z.string().min(1).max(140),
});
export type NarrationLine = z.infer<typeof NarrationLine>;

/** One spoken word and when it is heard, in whole ms from the start of its clip or answer. */
export const TimedWord = z
  .object({
    text: z.string().min(1).max(60),
    fromMs: z.number().int().min(0),
    toMs: z.number().int(),
  })
  .refine((w) => w.toMs > w.fromMs, { path: ['toMs'], message: 'A word ends after it starts' });
export type TimedWord = z.infer<typeof TimedWord>;

/**
 * One synthesised narrator line of an episode's plan version, stored in R2 under `key` and cached by
 * `hash` (SHA-256 hex). `kept` is false when the 25% cap left it out.
 */
export const NarrationClip = z.object({
  episodeId: Uuid,
  planVersion: z.number().int().min(1),
  index: z.number().int().min(0),
  kind: z.enum(['bridge', 'tease']),
  sceneIndex: z.number().int().min(0).optional(),
  text: z.string().min(1).max(140),
  voiceId: z.string().min(1),
  key: z.string().min(1),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  durationMs: z.number().int().min(1),
  words: z.array(TimedWord).min(1).max(60),
  kept: z.boolean(),
  createdAt: Timestamp,
});
export type NarrationClip = z.infer<typeof NarrationClip>;
