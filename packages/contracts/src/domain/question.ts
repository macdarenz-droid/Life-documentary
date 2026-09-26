import { z } from 'zod';
import { LocalDate, Uuid } from '../ids';
import { QuestionTag } from '../question';

/** A question as stored on the device: one per day, from the question engine. */
export const Question = z.object({
  id: Uuid,
  documentaryId: Uuid,
  templateId: z.string().regex(/^q\d{3}$/),
  reason: QuestionTag,
  askedOn: LocalDate,
  storylineId: Uuid.optional(),
  text: z.string().min(12).max(200),
  answeredByMomentId: Uuid.optional(),
});
export type Question = z.infer<typeof Question>;
