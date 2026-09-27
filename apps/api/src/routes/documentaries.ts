// POST /documentaries/link: the phone's local documentary joins the account. A new id is stored with the
// signed-in person as owner; the same id already theirs comes back unchanged; someone else's is a 409.
import { LinkDocumentary, LinkDocumentaryResult } from '@life/contracts';
import { Hono } from 'hono';
import { database } from '../data/db';
import * as documentariesRepo from '../data/repositories/documentaries';
import { apiError } from '../shared/errors';
import { parseBody } from './body';
import { requireSession, type AppEnv } from './middleware/session';

export const documentaries = new Hono<AppEnv>().post(
  '/documentaries/link',
  requireSession,
  async (c) => {
    const body = await parseBody(c, LinkDocumentary);
    if (!body) return apiError(c, 400, 'bad_request', 'The documentary could not be read.');
    const db = database(c.env.DB);
    const existing = await documentariesRepo.get(db, body.id);
    if (existing && existing.ownerUserId !== c.var.user.id) {
      return apiError(c, 409, 'conflict', 'This documentary belongs to another account.');
    }
    const documentary =
      existing ?? (await documentariesRepo.insert(db, { ...body, ownerUserId: c.var.user.id }));
    return c.json(LinkDocumentaryResult.parse({ documentary }), 200);
  },
);
