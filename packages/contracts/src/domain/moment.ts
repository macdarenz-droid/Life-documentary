import { z } from 'zod';
import { IanaTimeZone, Timestamp, Uuid } from '../ids';
import { isUnique } from './unique';

export const MomentKind = z.enum(['answer', 'clip', 'photo', 'note']);
export type MomentKind = z.infer<typeof MomentKind>;

/** Chosen by the person, never inferred (CLAUDE.md rule 7). */
export const MomentMood = z.enum(['bright', 'calm', 'tender', 'tired', 'heavy']);
export type MomentMood = z.infer<typeof MomentMood>;

export const Moment = z
  .object({
    id: Uuid,
    documentaryId: Uuid,
    authorUserId: Uuid,
    capturedAt: Timestamp,
    timeZone: IanaTimeZone,
    kind: MomentKind,
    questionId: Uuid.optional(),
    mediaAssetId: Uuid.optional(),
    text: z.string().min(1).max(500).optional(),
    mood: MomentMood.optional(),
    placeName: z.string().min(1).max(80).optional(),
    localOnly: z.boolean(),
    storylineIds: z.array(Uuid).max(10).refine(isUnique, { message: 'Duplicate storyline id' }),
    castIds: z.array(Uuid).max(20).refine(isUnique, { message: 'Duplicate cast id' }),
    updatedAt: Timestamp,
    deletedAt: Timestamp.optional(),
  })
  .superRefine((m, ctx) => {
    if (m.kind === 'answer' && m.questionId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['questionId'],
        message: 'An answer needs its question',
      });
    }
    if (m.kind !== 'note' && m.mediaAssetId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['mediaAssetId'],
        message: `A ${m.kind} needs its media`,
      });
    }
    if (m.kind === 'note') {
      if (m.text === undefined) {
        ctx.addIssue({ code: 'custom', path: ['text'], message: 'A note needs text' });
      }
      if (m.mediaAssetId !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['mediaAssetId'], message: 'A note has no media' });
      }
    }
  });
export type Moment = z.infer<typeof Moment>;
