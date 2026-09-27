import { z } from 'zod';
import { Uuid } from '../ids';
import { MusicMood } from './musicMood';

/**
 * What the planner model returns (P13, D39): moments by id and the words, never times. The server
 * turns it into an EpisodePlanV1 with assemblePlan. Parsed before anything else reads a model answer.
 */
export const PlannerOutput = z.object({
  title: z.string().min(1).max(60),
  subtitle: z.string().min(1).max(80).optional(),
  coldOpen: z.object({ momentId: Uuid }),
  scenes: z
    .array(
      z.object({
        heading: z.string().min(1).max(60),
        storylineId: Uuid.optional(),
        shots: z
          .array(z.object({ momentId: Uuid }))
          .min(1)
          .max(6),
        narratorBridge: z.object({ text: z.string().min(1).max(140) }).optional(),
      }),
    )
    .min(3)
    .max(5),
  closing: z.object({ momentId: Uuid }),
  tease: z.object({ storylineId: Uuid, text: z.string().min(1).max(100) }).optional(),
  musicMood: MusicMood,
  lowerThirds: z.array(z.object({ momentId: Uuid, castId: Uuid })).max(20),
  summary: z.string().min(1).max(400),
});
export type PlannerOutput = z.infer<typeof PlannerOutput>;
