// A person's phones; one row per phone id, its last_seen_at moved on every registration.
import { RegisterDevice, Timestamp, Uuid } from '@life/contracts';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db';
import { devices } from '../schema';

export const Device = RegisterDevice.extend({
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
  const [row] = await db
    .insert(devices)
    .values({ ...input, userId, createdAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: devices.id,
      set: { userId, platform: input.platform, appVersion: input.appVersion, lastSeenAt: now },
    })
    .returning();
  return Device.parse(row);
}

export async function listByUser(db: Db, userId: Uuid): Promise<Device[]> {
  const rows = await db.select().from(devices).where(eq(devices.userId, userId));
  return rows.map((row) => Device.parse(row));
}
