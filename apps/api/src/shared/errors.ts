import { ApiError, type ApiErrorCode } from '@life/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string,
): Response {
  return c.json(ApiError.parse({ error: { code, message } }), status);
}
