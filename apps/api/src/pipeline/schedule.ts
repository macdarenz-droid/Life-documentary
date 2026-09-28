// The weekly cron (P16, D42): every 15 minutes it starts each week whose run is due (`dueWeeks`) and has
// neither an episode nor a run record yet, skipping owners who asked for their account to be deleted.
// Instances are created in batches of 100 with the id `ep-{documentaryId}-{weekStart}` and the week's
// times as params.
import { Uuid, type Timestamp } from '@life/contracts';
import { dueWeeks, type DueWeek } from '@life/story';
import { database } from '../data/db';
import * as documentaries from '../data/repositories/documentaries';
import * as episodeRuns from '../data/repositories/episodeRuns';
import * as episodes from '../data/repositories/episodes';
import type { Env } from '../shared/env';
import { EpisodePipelineParams, episodeInstanceId } from './EpisodePipeline';

/** `createBatch` takes at most this many instances per call. */
export const BATCH = 100;

/** Starts every due week; returns the weeks it started. */
export async function startDueWeeks(
  env: Pick<Env, 'DB' | 'EPISODE_PIPELINE'>,
  now: Timestamp,
): Promise<DueWeek[]> {
  const db = database(env.DB);
  const due: DueWeek[] = [];
  for (const week of dueWeeks(await documentaries.listScheduled(db), now)) {
    const key = { documentaryId: Uuid.parse(week.documentaryId), weekStart: week.weekStart };
    if (await episodes.forWeek(db, key.documentaryId, key.weekStart)) continue;
    if (await episodeRuns.exists(db, key)) continue;
    due.push(week);
  }
  for (let i = 0; i < due.length; i += BATCH) {
    await env.EPISODE_PIPELINE.createBatch(
      due.slice(i, i + BATCH).map((week) => ({
        id: episodeInstanceId(week.documentaryId, week.weekStart),
        params: EpisodePipelineParams.parse({
          documentaryId: week.documentaryId,
          weekStart: week.weekStart,
          renderAt: week.renderAt,
          deliverAt: week.deliverAt,
        }),
      })),
    );
  }
  return due;
}
