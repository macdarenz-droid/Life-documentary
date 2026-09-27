import { Hono } from 'hono';
import { createAuth } from './auth';
import { recordingMail, type MailSender } from './providers/mail';
import { account } from './routes/account';
import { devices } from './routes/devices';
import { documentaries } from './routes/documentaries';
import { health } from './routes/health';
import type { AppEnv } from './routes/middleware/session';
import { apiError } from './shared/errors';

/** The mail sender until the real vendor is chosen with the owner (DECISIONS D36). */
const defaultMail = recordingMail();

export function createApp({ mail = defaultMail }: { mail?: MailSender } = {}) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    let auth: ReturnType<typeof createAuth> | undefined;
    c.set('auth', () => (auth ??= createAuth(c.env, mail)));
    await next();
  });
  app.route('/', health);
  app.on(['GET', 'POST'], '/api/auth/*', (c) => c.var.auth().handler(c.req.raw));
  app.route('/', account);
  app.route('/', devices);
  app.route('/', documentaries);
  app.notFound((c) => apiError(c, 404, 'not_found', 'Not found.'));
  app.onError((err, c) => {
    console.error(err);
    return apiError(c, 500, 'internal', 'Something went wrong.');
  });
  return app;
}
