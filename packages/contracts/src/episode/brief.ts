import { z } from 'zod';
import { MomentKind, MomentMood } from '../domain/moment';
import { IanaTimeZone, LocalDate, Uuid } from '../ids';

/** The English weekday name of a brief moment's day. */
export const Weekday = z.enum([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]);
export type Weekday = z.infer<typeof Weekday>;

/** What the planner sees of one week: shareable moments only (no localOnly, no deleted). */
export const WeekBriefV1 = z.object({
  version: z.literal(1),
  documentaryId: Uuid,
  episodeNumber: z.number().int().min(1),
  weekStart: LocalDate,
  weekEnd: LocalDate,
  timeZone: IanaTimeZone,
  moments: z
    .array(
      z.object({
        momentId: Uuid,
        day: LocalDate,
        weekday: Weekday,
        kind: MomentKind,
        durationMs: z.number().int().min(0).optional(),
        questionText: z.string().optional(),
        transcript: z.string().optional(),
        caption: z.string().optional(),
        text: z.string().optional(),
        mood: MomentMood.optional(),
        placeName: z.string().optional(),
        storylineIds: z.array(Uuid),
        castIds: z.array(Uuid),
      }),
    )
    .max(300),
  storylines: z.array(z.object({ id: Uuid, title: z.string(), open: z.boolean() })),
  cast: z.array(z.object({ id: Uuid, name: z.string(), relation: z.string().optional() })),
  previousSummaries: z.array(z.string().max(400)).max(3),
  questionsAsked: z
    .array(z.object({ day: LocalDate, text: z.string(), answered: z.boolean() }))
    .max(7),
});
export type WeekBriefV1 = z.infer<typeof WeekBriefV1>;
