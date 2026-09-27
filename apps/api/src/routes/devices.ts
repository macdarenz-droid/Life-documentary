// POST /devices: the phone registers itself; a second call moves last_seen_at on the same row. A phone
// signed in to another account moves to that account (one row per phone id).
import { RegisterDevice } from '@life/contracts';
import { Hono } from 'hono';
import { database } from '../data/db';
import * as devicesRepo from '../data/repositories/devices';
import { apiError } from '../shared/errors';
import { parseBody } from './body';
import { requireSession, type AppEnv } from './middleware/session';

export const devices = new Hono<AppEnv>().post('/devices', requireSession, async (c) => {
  const body = await parseBody(c, RegisterDevice);
  if (!body) return apiError(c, 400, 'bad_request', 'The device could not be read.');
  const db = database(c.env.DB);
  const device = await devicesRepo.upsert(db, c.var.user.id, body, new Date().toISOString());
  return c.json(RegisterDevice.parse(device), 200);
});
