import { z } from 'zod';
import { Uuid } from '../ids';
import { MusicMood } from './musicMood';

const Index = z.number().int().min(0);

/** One of the five changes a person can make to an episode's plan (P17, D43). */
export const EditChange = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('retitle'), title: z.string().min(1).max(60) }),
  z.object({
    kind: z.literal('swapLine'),
    sceneIndex: Index,
    with: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('moment'),
        momentId: Uuid,
        inMs: z.number().int().min(0).optional(),
        outMs: z.number().int().min(1).optional(),
      }),
      z.object({ kind: z.literal('bridge'), text: z.string().min(1).max(140) }),
    ]),
  }),
  z.object({ kind: z.literal('dropClip'), sceneIndex: Index, shotIndex: Index }),
  z.object({ kind: z.literal('closingShot'), momentId: Uuid }),
  z.object({ kind: z.literal('musicMood'), mood: MusicMood }),
]);
export type EditChange = z.infer<typeof EditChange>;

/** An edit sent by the phone: made on plan version `appliedToVersion` (P17, D43). */
export const EditRequest = z.object({
  id: Uuid,
  appliedToVersion: z.number().int().min(1),
  change: EditChange,
});
export type EditRequest = z.infer<typeof EditRequest>;

/** Why a change could not be applied. */
export const EditRefusal = z.enum([
  'noScene',
  'noShot',
  'noLine',
  'notAnAnswer',
  'alreadyIn',
  'notInCut',
  'unchanged',
  'sceneFull',
  'lastShot',
  'tooShort',
  'tooLong',
  'narratorTooLong',
  'noNarrator',
  'hasNumbers',
  'doesNotFit',
]);
export type EditRefusal = z.infer<typeof EditRefusal>;

/** Where a re-cut stands: being made, waiting for an answer from the phone, or undone. */
export const RecutState = z.enum(['working', 'waiting', 'failed']);
export type RecutState = z.infer<typeof RecutState>;

/** The kind of a shot's moment; absent when the moment is gone. */
export const CutShotKind = z.enum(['answer', 'clip', 'photo']);
export type CutShotKind = z.infer<typeof CutShotKind>;

/** The cut the phone edits: the stored plan as the person sees it, with the day's edits left. */
export const EpisodeCut = z.object({
  episodeId: Uuid,
  planVersion: z.number().int().min(1),
  title: z.string().min(1).max(60),
  narrated: z.boolean(),
  coldOpen: z.object({ momentId: Uuid }),
  scenes: z
    .array(
      z.object({
        heading: z.string().min(1).max(60),
        line: z.string().min(1).max(140).optional(),
        shots: z
          .array(z.object({ momentId: Uuid, kind: CutShotKind.optional() }))
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(5),
  closing: z.object({ momentId: Uuid }),
  mood: MusicMood,
  editsLeft: z.number().int().min(0),
  editsPerDay: z.number().int().min(1),
  recut: RecutState.optional(),
});
export type EpisodeCut = z.infer<typeof EpisodeCut>;

/** The answer to an edit, keyed by `outcome`. */
export const EditResult = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('applied'),
    cut: EpisodeCut,
    /** Answers the re-cut waits for from this phone. */
    waitingFor: z.array(Uuid),
  }),
  z.object({ outcome: z.literal('stale'), cut: EpisodeCut }),
  z.object({ outcome: z.literal('refused'), reason: EditRefusal }),
  z.object({ outcome: z.literal('limit'), cut: EpisodeCut }),
]);
export type EditResult = z.infer<typeof EditResult>;
