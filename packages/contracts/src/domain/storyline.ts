import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';

export const Storyline = z
  .object({
    id: Uuid,
    documentaryId: Uuid,
    title: z.string().min(1).max(60),
    openedAt: Timestamp,
    closedAt: Timestamp.optional(),
    summary: z.string().max(400).optional(),
    updatedAt: Timestamp,
    deletedAt: Timestamp.optional(),
  })
  .refine((s) => s.closedAt === undefined || Date.parse(s.closedAt) > Date.parse(s.openedAt), {
    path: ['closedAt'],
    message: 'A storyline closes after it opens',
  });
export type Storyline = z.infer<typeof Storyline>;

/** A person the user names. No photo, face or voice field of any kind (CLAUDE.md rule 7). */
export const CastMember = z.object({
  id: Uuid,
  documentaryId: Uuid,
  name: z.string().min(1).max(40),
  relation: z.string().min(1).max(40).optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: Timestamp.optional(),
});
export type CastMember = z.infer<typeof CastMember>;
