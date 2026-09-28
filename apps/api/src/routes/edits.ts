// Edits (P17, D43). `GET /episodes/:id/cut` gives the cut the phone edits; `POST /episodes/:id/edits`
// checks a change, stores it as the next plan version with its edit row in one D1 batch, claims the
// re-cut when no run holds it and hands the change to the run. Both answer 404 unless the episode is the
// caller's, `ready` and rendered. Every body is parsed with the contracts both ways.
import {
  EditRequest,
  EditResult,
  EpisodeCut,
  Uuid,
  type Documentary,
  type Episode,
  type EpisodePlanV1,
} from '@life/contracts';
import { applyEdit, cutOf, localDay, weekBrief } from '@life/story';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { database, type Db } from '../data/db';
import { mediaKey } from '../data/mediaKeys';
import { briefInput } from '../data/repositories/brief';
import * as documentariesRepo from '../data/repositories/documentaries';
import * as editsRepo from '../data/repositories/edits';
import * as episodesRepo from '../data/repositories/episodes';
import * as originalRequests from '../data/repositories/originalRequests';
import * as plans from '../data/repositories/plans';
import * as week from '../data/repositories/week';
import { ORIGINALS_READY_EVENT } from '../pipeline/EpisodePipeline';
import { planMomentIds } from '../pipeline/render/steps';
import { recutRunId, startRecut } from '../pipeline/recut/start';
import { EDITS_PER_DAY, editsLeft } from '../policy/edits';
import { apiError } from '../shared/errors';
import { parseBody } from './body';
import { requireSession, type AppEnv } from './middleware/session';

type Found = { db: Db; episode: Episode; documentary: Documentary };

/** The caller's ready, rendered episode named by the path, or null. */
async function ownEpisode(c: Context<AppEnv>): Promise<Found | null> {
  const id = Uuid.safeParse(c.req.param('id'));
  if (!id.success) return null;
  const db = database(c.env.DB);
  const episode = await episodesRepo.get(db, id.data);
  if (!episode || episode.state !== 'ready' || episode.renderVersion < 1) return null;
  const documentary = await documentariesRepo.get(db, episode.documentaryId);
  if (!documentary || documentary.ownerUserId !== c.var.user.id) return null;
  return { db, episode, documentary };
}

/** The episode's cut as it is stored now, with the day's edits left and where a re-cut stands. */
async function currentCut({ db, episode, documentary }: Found, now: string): Promise<EpisodeCut> {
  const fresh = (await episodesRepo.get(db, episode.id)) ?? episode;
  const stored = await plans.current(db, fresh.id);
  if (!stored) throw new Error('The episode has no plan.');
  const brief = weekBrief(await briefInput(db, fresh));
  const today = await editsRepo.countOnDay(db, fresh.id, localDay(now, documentary.timeZone));
  const recut = (await episodesRepo.recutOf(db, fresh.id))?.state;
  return EpisodeCut.parse({
    ...cutOf(stored.plan, brief),
    episodeId: fresh.id,
    planVersion: stored.version,
    editsLeft: editsLeft(today),
    editsPerDay: EDITS_PER_DAY,
    ...(recut ? { recut } : {}),
  });
}

/** Whether a failed batch failed on a unique key (a replayed id, or an edit that landed first). */
function isUniqueClash(error: unknown): boolean {
  const text = (e: unknown): string =>
    e instanceof Error ? `${e.message} ${e.cause === undefined ? '' : text(e.cause)}` : '';
  return /UNIQUE constraint failed/i.test(text(error));
}

/** The answers the change swaps in whose original is not in R2, as requests to reopen. */
async function missingAnswers(
  { db, episode, documentary }: Found,
  change: EditRequest['change'],
  media: R2Bucket,
): Promise<originalRequests.RequestedAsset[]> {
  if (change.kind !== 'swapLine' || change.with.kind !== 'moment') return [];
  const momentId = change.with.momentId;
  const found = (await week.momentsOfWeek(db, episode.documentaryId, episode.weekStart)).find(
    (m) => m.moment.id === momentId,
  );
  if (!found?.asset) return [];
  const key = mediaKey(found.asset.ownerUserId, documentary.id, found.asset.id, 'original');
  if (await media.head(key)) return [];
  return [{ documentaryId: documentary.id, momentId: found.moment.id, assetId: found.asset.id }];
}

const answer = (c: Context<AppEnv>, result: EditResult) => c.json(EditResult.parse(result), 200);

export const edits = new Hono<AppEnv>()
  .get('/episodes/:id/cut', requireSession, async (c) => {
    const found = await ownEpisode(c);
    if (!found) return apiError(c, 404, 'not_found', 'There is no episode to change here.');
    return c.json(EpisodeCut.parse(await currentCut(found, new Date().toISOString())), 200);
  })
  .post('/episodes/:id/edits', requireSession, async (c) => {
    const found = await ownEpisode(c);
    if (!found) return apiError(c, 404, 'not_found', 'There is no episode to change here.');
    const body = await parseBody(c, EditRequest);
    if (!body) return apiError(c, 400, 'bad_request', 'The change could not be read.');
    const { db, episode, documentary } = found;
    const now = new Date().toISOString();
    const day = localDay(now, documentary.timeZone);
    const replay = async () =>
      answer(c, { outcome: 'applied', cut: await currentCut(found, now), waitingFor: [] });

    if (await editsRepo.get(db, body.id)) return replay();
    if ((await editsRepo.countOnDay(db, episode.id, day)) >= EDITS_PER_DAY) {
      return answer(c, { outcome: 'limit', cut: await currentCut(found, now) });
    }
    const stored = await plans.current(db, episode.id);
    if (!stored || body.appliedToVersion !== stored.version) {
      return answer(c, { outcome: 'stale', cut: await currentCut(found, now) });
    }
    const brief = weekBrief(await briefInput(db, episode));
    const applied = applyEdit(stored.plan, body.change, brief);
    if (!applied.ok) return answer(c, { outcome: 'refused', reason: applied.reason });

    const plan: EpisodePlanV1 = applied.plan;
    const version = stored.version + 1;
    const runId = recutRunId(episode.id, version);
    const waiting = await missingAnswers(found, body.change, c.env.MEDIA);
    const shown = planMomentIds(plan);
    const unshown = (await originalRequests.forEpisode(db, episode.id)).filter(
      (r) => r.state === 'open' && !shown.has(r.momentId),
    );
    const statements = [
      editsRepo.insert(db, {
        id: body.id,
        episodeId: episode.id,
        appliedToVersion: stored.version,
        resultVersion: version,
        change: body.change,
        localDay: day,
        createdAt: now,
      }),
      plans.insert(db, {
        episodeId: episode.id,
        version,
        plan,
        createdBy: 'edit',
        createdAt: now,
      }),
      ...episodesRepo.pointAtPlan(db, episode.id, { version, summary: plan.summary }, now),
      ...originalRequests.reopenStatements(db, episode.id, waiting, now),
      ...originalRequests.closeStatements(db, unshown, now),
      ...episodesRepo.claimRecut(db, episode.id, runId, now),
    ];
    try {
      await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
    } catch (error) {
      if (!isUniqueClash(error)) throw error;
      if (await editsRepo.get(db, body.id)) return replay();
      return answer(c, { outcome: 'stale', cut: await currentCut(found, now) });
    }

    // The cron restarts or undoes a run whose claim is still set, so errors here are only logged.
    const run = (await episodesRepo.recutOf(db, episode.id))?.run;
    try {
      if (run === runId) {
        await startRecut(c.env, episode.id, runId);
      } else if (run) {
        const instance = await c.env.RECUT_PIPELINE.get(run);
        await instance.sendEvent({
          type: ORIGINALS_READY_EVENT,
          payload: { episodeId: episode.id },
        });
      }
    } catch (error) {
      console.error('The re-cut run was not started or woken.', error);
    }
    return answer(c, {
      outcome: 'applied',
      cut: await currentCut(found, now),
      waitingFor: waiting.map((w) => w.momentId),
    });
  });
