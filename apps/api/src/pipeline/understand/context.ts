// What the understanding functions work over: the database, the media bucket, the two model ports and
// the clock. The Workflow builds it from the Worker's env; tests build it from the pool's bindings.
import type { LocalDate, Timestamp, Uuid } from '@life/contracts';
import { database, type Db } from '../../data/db';
import { pipelineProviders } from '../../providers';
import type { Env } from '../../shared/env';
import type { Captioner, Transcriber } from '../ports';

export type UnderstandContext = {
  db: Db;
  media: R2Bucket;
  transcriber: Transcriber;
  captioner: Captioner;
  clock: { now(): Timestamp };
};

/** The episode a run works on, as its steps pass it along. */
export type EpisodeRef = { id: Uuid; documentaryId: Uuid; weekStart: LocalDate };

export function understandContext(env: Env): UnderstandContext {
  return {
    db: database(env.DB),
    media: env.MEDIA,
    ...pipelineProviders(env),
    clock: { now: () => new Date().toISOString() },
  };
}
