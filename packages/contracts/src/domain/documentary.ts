import { z } from 'zod';
import { IanaTimeZone, Timestamp, Uuid } from '../ids';

export const Documentary = z.object({
  id: Uuid,
  ownerUserId: Uuid,
  title: z.string().min(1).max(80),
  kind: z.enum(['solo', 'shared']),
  timeZone: IanaTimeZone,
  /** Day the weekly episode arrives: 0 = Sunday … 6 = Saturday. */
  episodeDay: z.number().int().min(0).max(6).default(0),
  episodeHour: z.number().int().min(0).max(23).default(18),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Documentary = z.infer<typeof Documentary>;
