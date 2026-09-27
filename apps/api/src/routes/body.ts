import type { Context } from 'hono';
import type { z } from 'zod';

/** The request body parsed with a contract, or null when it is missing or does not fit. */
export async function parseBody<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.infer<T> | null> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
