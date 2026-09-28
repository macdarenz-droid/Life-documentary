// Starting and resuming re-cuts (P17, D43). A run's id is `recut-{episodeId}-v{n}`, where n is the plan
// version whose edit claimed the episode. The 15-minute cron starts again a claimed run whose instance
// is missing, and undoes one whose instance has ended without releasing the claim.
import type { Uuid } from '@life/contracts';
import * as episodes from '../../data/repositories/episodes';
import type { Env } from '../../shared/env';
import { RecutPipelineParams } from './RecutPipeline';
import { recutContext, revertRecut, tidyOriginals } from './steps';

export const recutRunId = (episodeId: string, planVersion: number) =>
  `recut-${episodeId}-v${planVersion}`;

/** Starts the run; `createBatch` skips an id that already exists. */
export async function startRecut(
  env: Pick<Env, 'RECUT_PIPELINE'>,
  episodeId: Uuid,
  runId: string,
): Promise<void> {
  await env.RECUT_PIPELINE.createBatch([
    { id: runId, params: RecutPipelineParams.parse({ episodeId, runId }) },
  ]);
}

/** The instance statuses whose run has stopped for good. */
const ENDED = new Set(['errored', 'terminated', 'complete']);

/**
 * For every episode whose claim is held: an instance that doesn't exist is created again; one that has
 * ended (errored, terminated, or complete with the claim still set) gets the failure work with its run
 * id, the revert batch then the tidy; anything else is left alone. Returns the run ids it acted on.
 */
export async function resumeRecuts(
  env: Pick<Env, 'DB' | 'MEDIA' | 'RECUT_PIPELINE'>,
): Promise<string[]> {
  const ctx = recutContext(env);
  const acted: string[] = [];
  for (const { id, run } of await episodes.withRecutRun(ctx.db)) {
    try {
      let instance;
      try {
        instance = await env.RECUT_PIPELINE.get(run);
      } catch {
        await startRecut(env, id, run);
        acted.push(run);
        continue;
      }
      const { status } = await instance.status();
      if (!ENDED.has(status)) continue;
      await revertRecut(ctx, id, run);
      await tidyOriginals(ctx, id);
      acted.push(run);
    } catch (error) {
      console.error('A re-cut could not be resumed.', { episodeId: id, error });
    }
  }
  return acted;
}
