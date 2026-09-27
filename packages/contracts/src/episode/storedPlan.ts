import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';
import { EpisodePlanV1 } from './plan';

/** One stored version of an episode's plan (P13): made by the model or the recap. */
export const StoredPlan = z.object({
  episodeId: Uuid,
  version: z.number().int().min(1),
  plan: EpisodePlanV1,
  createdBy: z.enum(['model', 'recap']),
  createdAt: Timestamp,
});
export type StoredPlan = z.infer<typeof StoredPlan>;
