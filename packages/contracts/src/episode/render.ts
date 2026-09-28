import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';

/**
 * One render of an episode (P15, D41): a plan version drawn in one shape, its file's key and length, how
 * far it got, and what it cost in micro-dollars once it finished.
 */
export const EpisodeRender = z.object({
  id: Uuid,
  episodeId: Uuid,
  planVersion: z.number().int().min(1),
  renderVersion: z.number().int().min(1),
  format: z.enum(['portrait', 'landscape']),
  vendorRenderId: z.string().min(1).optional(),
  bucket: z.string().min(1).optional(),
  outKey: z.string().min(1),
  durationMs: z.number().int().min(1),
  state: z.enum(['starting', 'rendering', 'done', 'failed']),
  reason: z.string().min(1).max(80).optional(),
  costMicroUsd: z.number().int().min(0).optional(),
  startedAt: Timestamp,
  finishedAt: Timestamp.optional(),
});
export type EpisodeRender = z.infer<typeof EpisodeRender>;
