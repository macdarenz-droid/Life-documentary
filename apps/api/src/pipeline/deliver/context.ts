// What the delivery steps use (P16, D42): D1, the media bucket, the pusher and the clock.
import type { Timestamp } from '@life/contracts';
import { database, type Db } from '../../data/db';
import { pipelineProviders } from '../../providers';
import type { Env } from '../../shared/env';
import type { Pusher } from '../ports';

export type DeliverContext = {
  db: Db;
  media: R2Bucket;
  pusher: Pusher;
  clock: { now(): Timestamp };
};

export function deliverContext(env: Env): DeliverContext {
  return {
    db: database(env.DB),
    media: env.MEDIA,
    pusher: pipelineProviders(env).pusher,
    clock: { now: () => new Date().toISOString() },
  };
}
