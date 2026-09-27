// Every product route needs a signed-in person: the session is read from the request's cookie or bearer
// token by Better Auth; without one the route answers 401 in the ApiError shape.
import { Uuid } from '@life/contracts';
import type { MiddlewareHandler } from 'hono';
import type { createAuth } from '../../auth';
import type { Env } from '../../shared/env';
import { apiError } from '../../shared/errors';

export type Auth = ReturnType<typeof createAuth>;

export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** Builds the auth instance for this request's env. */
    auth: () => Auth;
    user: { id: Uuid; email: string };
  };
};

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const found = await c.var.auth().api.getSession({ headers: c.req.raw.headers });
  const id = Uuid.safeParse(found?.user.id);
  if (!found || !id.success) return apiError(c, 401, 'unauthorized', 'Sign in first.');
  c.set('user', { id: id.data, email: found.user.email });
  await next();
};
