import { z } from 'zod';
import { Uuid } from '../ids';
import { MusicMood } from './musicMood';

const Index = z.number().int().min(0);

/** One edit the person made to an episode, applied in `seq` order to plan version `appliedToVersion`. */
export const EditOp = z.object({
  id: Uuid,
  episodeId: Uuid,
  seq: z.number().int().min(1),
  appliedToVersion: z.number().int().min(1),
  op: z.discriminatedUnion('kind', [
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
  ]),
});
export type EditOp = z.infer<typeof EditOp>;
