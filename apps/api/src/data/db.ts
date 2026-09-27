import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';

export type Db = DrizzleD1Database;

export function database(d1: D1Database): Db {
  return drizzle(d1);
}
