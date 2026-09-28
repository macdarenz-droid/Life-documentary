// The account API (P4): who is signed in, the phone's registration and the first link of its local
// documentary. Parsed on the phone and in the Worker (CLAUDE.md rule 3).
import { z } from 'zod';
import { Documentary } from '../domain/documentary';
import { Timestamp, Uuid } from '../ids';

/** Days between a deletion request and the purge (P21's DeleteJob); the words say "30 days". */
export const ACCOUNT_PURGE_DAYS = 30;

export const DevicePlatform = z.enum(['ios', 'android']);
export type DevicePlatform = z.infer<typeof DevicePlatform>;

/** POST /devices: the phone's own id, chosen once on the phone. */
export const RegisterDevice = z.object({
  id: Uuid,
  platform: DevicePlatform,
  appVersion: z.string().min(1).max(40),
  /** The Expo push token (P16), sent once notifications are allowed and the app has a project id. */
  pushToken: z
    .string()
    .min(1)
    .max(200)
    .regex(/^Expo(nent)?PushToken\[.+\]$/)
    .optional(),
});
export type RegisterDevice = z.infer<typeof RegisterDevice>;

/** POST /documentaries/link: the local documentary as the phone holds it. */
export const LinkDocumentary = Documentary;
export type LinkDocumentary = z.infer<typeof LinkDocumentary>;

/** The documentary as stored, owned by the signed-in person. */
export const LinkDocumentaryResult = z.object({ documentary: Documentary });
export type LinkDocumentaryResult = z.infer<typeof LinkDocumentaryResult>;

/** GET /me. `deletion` is set while a deletion request is open. */
export const Me = z.object({
  userId: Uuid,
  email: z.email(),
  documentaries: z.array(Documentary),
  deletion: z.object({ purgeAfter: Timestamp }).nullable(),
});
export type Me = z.infer<typeof Me>;
