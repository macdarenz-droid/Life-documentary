import { Hono } from 'hono';
import { createAuth } from './auth';
import { recordingMail, type MailSender } from './providers/mail';
import { health } from './routes/health';
import type { Env } from './shared/env';
import { apiError } from './shared/errors';

/** The mail sender until the real vendor is chosen with the owner (DECISIONS D36). */
const defaultMail = recordingMail();

export function createApp({ mail = defaultMail }: { mail?: MailSender } = {}) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', health);
  app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env, mail).handler(c.req.raw));
  app.notFound((c) => apiError(c, 404, 'not_found', 'Not found.'));
  app.onError((err, c) => {
    console.error(err);
    return apiError(c, 500, 'internal', 'Something went wrong.');
  });
  return app;
}
