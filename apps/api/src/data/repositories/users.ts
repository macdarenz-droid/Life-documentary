// Reads of Better Auth's user table that the product needs outside Better Auth.
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { user } from '../schema';

export async function existsByEmail(db: Db, email: string): Promise<boolean> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  return row !== undefined;
}
