import { Hono } from 'hono';
import { health } from './routes/health';
import type { Env } from './shared/env';
import { apiError } from './shared/errors';

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', health);
  app.notFound((c) => apiError(c, 404, 'not_found', 'Not found.'));
  app.onError((err, c) => {
    console.error(err);
    return apiError(c, 500, 'internal', 'Something went wrong.');
  });
  return app;
}
