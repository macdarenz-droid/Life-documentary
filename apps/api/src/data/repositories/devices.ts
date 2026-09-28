// A person's phones; one row per phone id, its last_seen_at moved on every registration. A push token
// (P16) lives on one row only: registering it on a phone clears it from every other row.
import { RegisterDevice, Timestamp, Uuid } from '@life/contracts';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db';
import { devices } from '../schema';

export const Device = RegisterDevice.omit({ pushToken: true }).extend({
  pushToken: z.string().nullable(),
  userId: Uuid,
  createdAt: Timestamp,
  lastSeenAt: Timestamp,
});
export type Device = z.infer<typeof Device>;

export async function upsert(
  db: Db,
  userId: Uuid,
  device: RegisterDevice,
  now: Timestamp,
): Promise<Device> {
  const input = RegisterDevice.parse(device);
  const token = input.pushToken;
  if (token !== undefined) {
    await db
      .update(devices)
      .set({ pushToken: null })
      .where(and(eq(devices.pushToken, token), ne(devices.id, input.id)));
  }
  const [row] = await db
    .insert(devices)
    .values({ ...input, pushToken: token ?? null, userId, createdAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: devices.id,
      set: {
        userId,
        platform: input.platform,
        appVersion: input.appVersion,
        lastSeenAt: now,
        // An absent token keeps the stored one.
        ...(token !== undefined ? { pushToken: token } : {}),
      },
    })
    .returning();
  return Device.parse(row);
}

/** The person's distinct push tokens. */
export async function tokensFor(db: Db, userId: Uuid): Promise<string[]> {
  const rows = await db
    .selectDistinct({ pushToken: devices.pushToken })
    .from(devices)
    .where(and(eq(devices.userId, userId), isNotNull(devices.pushToken)));
  return rows.flatMap((row) => (row.pushToken ? [row.pushToken] : []));
}

/** Forgets one token wherever it is stored (Expo said the device is no longer registered). */
export async function clearToken(db: Db, token: string): Promise<void> {
  await db.update(devices).set({ pushToken: null }).where(eq(devices.pushToken, token));
}

/** Forgets every push token of the person (an account deletion request). */
export async function clearTokens(db: Db, userId: Uuid): Promise<void> {
  await db.update(devices).set({ pushToken: null }).where(eq(devices.userId, userId));
}

export async function listByUser(db: Db, userId: Uuid): Promise<Device[]> {
  const rows = await db.select().from(devices).where(eq(devices.userId, userId));
  return rows.map((row) => Device.parse(row));
}
