import { z } from 'zod';
import { Uuid } from '../ids';
import { EditChange } from './edit';

/** One edit the person made to an episode, applied in `seq` order to plan version `appliedToVersion`. */
export const EditOp = z.object({
  id: Uuid,
  episodeId: Uuid,
  seq: z.number().int().min(1),
  appliedToVersion: z.number().int().min(1),
  op: EditChange,
});
export type EditOp = z.infer<typeof EditOp>;
