import { z } from 'zod';

/** The one daily reminder, stored on the device only. `scheduledId` is the local notification's id. */
export const DailyReminder = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  scheduledId: z.string().min(1).optional(),
});
export type DailyReminder = z.infer<typeof DailyReminder>;
