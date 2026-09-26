import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';

/** What a model derived from one moment's media: a transcript, a caption, or both. */
export const Derived = z
  .object({
    momentId: Uuid,
    transcript: z.string().max(4000).optional(),
    caption: z.string().max(500).optional(),
    language: z.string().min(2).max(12),
    provider: z.enum(['workersAi', 'anthropic']),
    modelVersion: z.string().min(1),
    producedAt: Timestamp,
  })
  .refine((d) => d.transcript !== undefined || d.caption !== undefined, {
    message: 'A derived row has a transcript or a caption',
  });
export type Derived = z.infer<typeof Derived>;
