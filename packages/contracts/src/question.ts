import { z } from 'zod';
import { Uuid } from './ids';

/** Why a question was chosen; also the tags a template carries. */
export const QuestionTag = z.enum([
  'after_quiet_days',
  'anniversary',
  'open_storyline',
  'person_seen',
  'place_first_time',
  'weekday',
  'weekend',
  'season',
  'general',
]);
export type QuestionTag = z.infer<typeof QuestionTag>;

/** One template of the question bank. The text may contain one slot: {storyline}, {person} or {place}. */
export const QuestionTemplate = z.object({
  id: z.string().regex(/^q\d{3}$/),
  tags: z.array(QuestionTag).min(1),
  text: z.string().min(12).max(120),
});
export type QuestionTemplate = z.infer<typeof QuestionTemplate>;

/** The engine's choice for one day: slots filled, the rule that chose it. */
export const QuestionPick = z.object({
  templateId: z.string().regex(/^q\d{3}$/),
  reason: QuestionTag,
  text: z
    .string()
    .min(12)
    .max(200)
    .refine((t) => !t.includes('{') && !t.includes('}'), { message: 'Unfilled slot' }),
  storylineId: Uuid.optional(),
});
export type QuestionPick = z.infer<typeof QuestionPick>;
