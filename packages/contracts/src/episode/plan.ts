import { z } from 'zod';
import { isWeekSpan } from '../domain/episode';
import { LocalDate, Uuid } from '../ids';
import { KenBurns } from '../render/renderManifest';
import { MusicMood } from './musicMood';

const Shot = z
  .object({
    momentId: Uuid,
    inMs: z.number().int().min(0).optional(),
    outMs: z.number().int().min(1).optional(),
    kenBurns: KenBurns.optional(),
  })
  .refine((s) => s.inMs === undefined || s.outMs === undefined || s.outMs > s.inMs, {
    path: ['outMs'],
    message: 'A shot ends after it starts',
  });

/** The planner's episode (API ↔ model ↔ render). A model plan is held to tighter bounds by validatePlan. */
export const EpisodePlanV1 = z
  .object({
    version: z.literal(1),
    title: z.string().min(1).max(60),
    subtitle: z.string().min(1).max(80).optional(),
    episodeNumber: z.number().int().min(1),
    weekStart: LocalDate,
    weekEnd: LocalDate,
    coldOpen: z.object({
      momentId: Uuid,
      inMs: z.number().int().min(0),
      outMs: z.number().int().min(1),
    }),
    scenes: z
      .array(
        z.object({
          heading: z.string().min(1).max(60),
          storylineId: Uuid.optional(),
          shots: z.array(Shot).min(1).max(6),
          narratorBridge: z.object({ text: z.string().min(1).max(140) }).optional(),
          captionsFromTranscript: z.boolean(),
        }),
      )
      .min(1)
      .max(5),
    closing: z.object({ momentId: Uuid }),
    tease: z.object({ storylineId: Uuid, text: z.string().min(1).max(100) }).optional(),
    music: z.object({ mood: MusicMood, trackId: z.string().min(1).optional() }),
    lowerThirds: z
      .array(z.object({ momentId: Uuid, castId: Uuid, atMs: z.number().int().min(0) }))
      .max(20),
    narratorVoiceId: z.string().min(1).max(40).optional(),
    targetDurationMs: z.number().int().min(20000).max(240000),
    summary: z.string().min(1).max(400),
  })
  .refine((p) => p.coldOpen.outMs > p.coldOpen.inMs, {
    path: ['coldOpen', 'outMs'],
    message: 'The cold open ends after it starts',
  })
  .refine((p) => isWeekSpan(p.weekStart, p.weekEnd), {
    path: ['weekEnd'],
    message: 'A week ends six days after it starts',
  });
export type EpisodePlanV1 = z.infer<typeof EpisodePlanV1>;
