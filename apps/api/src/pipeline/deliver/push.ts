// Sending one push to every phone of a person (P16, D42). Tokens Expo no longer knows are cleared, and
// nothing is sent to an account with an open deletion request.
import type { Uuid } from '@life/contracts';
import { database, type Db } from '../../data/db';
import * as deletionRequests from '../../data/repositories/deletionRequests';
import * as devicesRepo from '../../data/repositories/devices';
import { pipelineProviders } from '../../providers';
import type { Env } from '../../shared/env';
import type { PushMessage, PushResult, Pusher } from '../ports';

export type PushContext = { db: Db; pusher: Pusher };

export function pushContext(env: Env): PushContext {
  return { db: database(env.DB), pusher: pipelineProviders(env).pusher };
}

export async function pushTo(
  ctx: PushContext,
  userId: Uuid,
  message: Omit<PushMessage, 'to'>,
): Promise<PushResult[]> {
  if (await deletionRequests.open(ctx.db, userId)) return [];
  const tokens = await devicesRepo.tokensFor(ctx.db, userId);
  if (tokens.length === 0) return [];
  const results = await ctx.pusher.send(tokens.map((to) => ({ ...message, to })));
  for (const result of results) {
    if (result.outcome === 'deviceNotRegistered') await devicesRepo.clearToken(ctx.db, result.to);
  }
  return results;
}
