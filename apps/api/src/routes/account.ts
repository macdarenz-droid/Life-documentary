// GET /me, and the account deletion request (30 days, then P21's DeleteJob purges) and its cancelling.
import { Me } from '@life/contracts';
import { Hono } from 'hono';
import { database } from '../data/db';
import * as deletionRequests from '../data/repositories/deletionRequests';
import * as devicesRepo from '../data/repositories/devices';
import * as documentariesRepo from '../data/repositories/documentaries';
import { apiError } from '../shared/errors';
import { requireSession, type AppEnv } from './middleware/session';

export const account = new Hono<AppEnv>()
  .get('/me', requireSession, async (c) => {
    const db = database(c.env.DB);
    const { id, email } = c.var.user;
    const open = await deletionRequests.open(db, id);
    return c.json(
      Me.parse({
        userId: id,
        email,
        documentaries: await documentariesRepo.listByOwner(db, id),
        deletion: open ? { purgeAfter: open.purgeAfter } : null,
      }),
      200,
    );
  })
  .post('/account/delete', requireSession, async (c) => {
    const db = database(c.env.DB);
    await deletionRequests.request(db, c.var.user.id, new Date().toISOString());
    // Nothing is pushed to an account being deleted (D42).
    await devicesRepo.clearTokens(db, c.var.user.id);
    // Every session of the person ends: each phone has to sign in again to cancel.
    await c.var.auth().api.revokeSessions({ headers: c.req.raw.headers });
    return c.body(null, 204);
  })
  .post('/account/delete/cancel', requireSession, async (c) => {
    const cancelled = await deletionRequests.cancel(
      database(c.env.DB),
      c.var.user.id,
      new Date().toISOString(),
    );
    if (!cancelled) return apiError(c, 404, 'not_found', 'There is no deletion request to cancel.');
    return c.body(null, 204);
  });
