import { applyD1Migrations, introspectWorkflowInstance } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import {
  Documentary,
  Me,
  PlannerOutput,
  SyncChange,
  UploadedPart,
  Uuid,
  type EditChange,
} from '@life/contracts';
import { applyEdit, assemblePlan, weekBrief } from '@life/story';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { database } from '../src/data/db';
import { mediaKey } from '../src/data/mediaKeys';
import { episodes as episodesTable } from '../src/data/schema';
import { briefInput, previousSummaries } from '../src/data/repositories/brief';
import * as costLedger from '../src/data/repositories/costLedger';
import * as episodes from '../src/data/repositories/episodes';
import * as originalRequests from '../src/data/repositories/originalRequests';
import * as plans from '../src/data/repositories/plans';
import * as renders from '../src/data/repositories/renders';
import { fitStep, lineStep, linesStep, narrateContext } from '../src/pipeline/narrate/steps';
import { checkRender, renderContext, renderInput, startRender } from '../src/pipeline/render/steps';
import { recutRunId, resumeRecuts, startRecut } from '../src/pipeline/recut/start';
import {
  dropRenders,
  recordRecutNarration,
  recutContext,
  revertRecut,
  tidyOriginals,
} from '../src/pipeline/recut/steps';
import { fixtures } from '../src/providers/fixture';
import type { Env } from '../src/shared/env';
import { bindings, testApp } from './session';
import { WEEK, seedDocumentary, type Seeded } from './understandSeed';

const T = '2027-03-21T18:00:00.000Z';
const T0 = '2027-03-15T08:00:00.000Z';
const CONTENT_TYPE = {
  videoAnswer: 'video/quicktime',
  voiceAnswer: 'audio/mp4',
  photo: 'image/jpeg',
  clip: 'video/mp4',
  note: 'text/plain',
} as const;

type Seed = Awaited<ReturnType<typeof seedDocumentary>>;

beforeEach(() => fixtures.reset());

const db = () => database(bindings.DB);
const originalKey = (seed: Seed, seeded: Seeded) =>
  mediaKey(seed.userId, seed.documentaryId, seeded.assetId!, 'original');
const putOriginal = (seed: Seed, seeded: Seeded) =>
  bindings.MEDIA.put(originalKey(seed, seeded), new Uint8Array(100).fill(1), {
    httpMetadata: { contentType: CONTENT_TYPE[seeded.kind] },
  });

/**
 * A published model episode: both answers, the photo and the clip shown, a narrator line on the first
 * scene, every original in R2 (the photo and clip met), narrated and rendered as render version 1. A
 * third answer (`spare`) is in the week but not in the cut.
 */
async function publishedEpisode() {
  const seed = await seedDocumentary();
  const week = await seed.fullWeek();
  const spare = await seed.add('voiceAnswer');
  await seed.upload(spare, 'answer');
  const found = await episodes.getOrCreate(seed.db, seed.documentaryId, WEEK, T);
  const brief = weekBrief(await briefInput(seed.db, found));
  const plan = assemblePlan(
    PlannerOutput.parse({
      title: 'Rain on the tram',
      coldOpen: { momentId: week.videoAnswer.momentId },
      scenes: [
        {
          heading: 'Wednesday',
          shots: [{ momentId: week.voiceAnswer.momentId }],
          narratorBridge: { text: 'Wednesday, at home.' },
        },
        { heading: 'Out', shots: [{ momentId: week.photo.momentId }] },
        { heading: 'Home', shots: [{ momentId: week.clip.momentId }] },
      ],
      closing: { momentId: week.photo.momentId },
      musicMood: 'calm',
      lowerThirds: [],
      summary: 'They rode the tram and took a photo.',
    }),
    brief,
    { narratorVoiceId: 'narrator-1' },
  );
  await plans.put(seed.db, {
    episodeId: found.id,
    version: 1,
    plan,
    createdBy: 'model',
    createdAt: T,
  });
  await episodes.setPlan(
    seed.db,
    found.id,
    { version: 1, summary: plan.summary, state: 'narrating' },
    T,
  );
  for (const seeded of [week.videoAnswer, week.voiceAnswer, week.photo, week.clip]) {
    await putOriginal(seed, seeded);
  }
  const requested = [week.photo, week.clip].map((s) => ({
    documentaryId: seed.documentaryId,
    momentId: s.momentId,
    assetId: s.assetId!,
  }));
  await originalRequests.open(seed.db, found.id, requested, T);
  for (const r of requested) await originalRequests.meet(seed.db, r.assetId, T);

  const narrate = narrateContext(bindings);
  const lines = await linesStep(narrate, found.id);
  for (const index of lines.indices) await lineStep(narrate, found.id, 1, index);
  await fitStep(narrate, found.id, 1);
  const render = renderContext(bindings);
  const started = await startRender(render, found.id, 'portrait');
  if (started.outcome !== 'started') throw new Error('The first render did not start.');
  expect(await checkRender(render, started.id)).toEqual({ outcome: 'done' });
  await episodes.setDelivered(seed.db, found.id, T);
  fixtures.reset();
  const episode = (await episodes.get(seed.db, found.id))!;
  expect(episode).toMatchObject({ state: 'ready', planVersion: 1, renderVersion: 1 });
  return { seed, week, spare, episode };
}

/**
 * Applies the change to the current plan and stores it as the next version (`edit`), claiming the
 * episode for `recut-{id}-v{n}` when the claim is empty. Returns the version and the claim.
 */
async function storeEdit(episodeId: Uuid, change: EditChange) {
  const episode = (await episodes.get(db(), episodeId))!;
  const current = (await plans.current(db(), episodeId))!;
  const brief = weekBrief(await briefInput(db(), episode));
  const out = applyEdit(current.plan, change, brief);
  if (!out.ok) throw new Error(`The edit was refused: ${out.reason}`);
  const version = current.version + 1;
  const runId = recutRunId(episodeId, version);
  await db().batch([
    plans.insert(db(), {
      episodeId,
      version,
      plan: out.plan,
      createdBy: 'edit',
      createdAt: T,
    }),
    db()
      .update(episodesTable)
      .set({
        planVersion: version,
        summary: out.plan.summary,
        recutRun: sql`COALESCE(${episodesTable.recutRun}, ${runId})`,
      })
      .where(eq(episodesTable.id, episodeId)),
  ]);
  return { version, runId: (await episodes.recutOf(db(), episodeId))!.run! };
}

type Instance = Awaited<ReturnType<typeof introspectWorkflowInstance>>;
type Modifier = Parameters<Parameters<Instance['modify']>[0]>[0];

/** Starts the re-cut with sleeps and retry delays off; `during` runs while it goes. */
async function runRecut(
  episodeId: Uuid,
  runId: string,
  extra: (m: Modifier) => Promise<void> = async () => {},
  during: (instance: Instance) => Promise<void> = async () => {},
) {
  const instance = await introspectWorkflowInstance(bindings.RECUT_PIPELINE, runId);
  try {
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
      await extra(m);
    });
    await startRecut(bindings, episodeId, runId);
    await during(instance);
    await instance.waitForStatus('complete');
    return (await instance.getOutput()) as { outcome: string; planVersion?: number };
  } finally {
    await instance.dispose();
  }
}

const wakeUp = async (runId: string) =>
  (await bindings.RECUT_PIPELINE.get(runId)).sendEvent({ type: 'originals-ready', payload: {} });

const renarrateRows = async (episodeId: Uuid) =>
  (await costLedger.forEpisode(db(), episodeId)).filter((r) => r.step === 'renarrate');

async function renderFiles(episodeId: Uuid) {
  const rows = (await renders.forEpisode(db(), episodeId)).filter((r) => r.state === 'done');
  const out: Record<number, boolean> = {};
  for (const r of rows) out[r.renderVersion] = (await bindings.MEDIA.head(r.outKey)) !== null;
  return out;
}

const planCount = async (episodeId: Uuid) =>
  (
    await bindings.DB.prepare('SELECT COUNT(*) AS n FROM episode_plans WHERE episode_id = ?')
      .bind(episodeId)
      .first<{ n: number }>()
  )?.n;

describe('the re-cut run', () => {
  it('publishes a rename as render version 2 with no narrator call, then drops the old file', async () => {
    const { episode } = await publishedEpisode();
    const { runId } = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    expect(await runRecut(episode.id, runId)).toEqual({ outcome: 'published', planVersion: 2 });

    expect(await episodes.get(db(), episode.id)).toMatchObject({
      state: 'ready',
      planVersion: 2,
      renderVersion: 2,
    });
    expect(await episodes.recutOf(db(), episode.id)).toEqual({ state: null, run: null });
    expect(await renderFiles(episode.id)).toEqual({ 1: false, 2: true });
    expect(fixtures.narrator.calls).toEqual([]);
    expect(await renarrateRows(episode.id)).toEqual([]);
    expect(JSON.stringify(fixtures.renderer.starts[0]?.manifest)).toContain('The tram');
  });

  it('speaks only a changed line and records its characters, once even when replayed', async () => {
    const { episode } = await publishedEpisode();
    const text = 'Wednesday, in the rain.';
    const { runId } = await storeEdit(episode.id, {
      kind: 'swapLine',
      sceneIndex: 0,
      with: { kind: 'bridge', text },
    });
    expect(await runRecut(episode.id, runId)).toMatchObject({ outcome: 'published' });
    expect(fixtures.narrator.calls.map((c) => c.text)).toEqual([text]);
    const [row] = await renarrateRows(episode.id);
    expect(row).toMatchObject({ provider: 'elevenlabs', unit: 'character', units: text.length });

    // The step runs again after its ledger write: the same row, the same count.
    await recordRecutNarration(recutContext(bindings), episode.id, 2, text.length);
    expect(await renarrateRows(episode.id)).toEqual([
      expect.objectContaining({ id: row!.id, units: text.length }),
    ]);
  });

  it('goes round again when the plan moves on during a render, and ends on the newest', async () => {
    const { episode } = await publishedEpisode();
    const { runId } = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    const start = fixtures.renderer.start.bind(fixtures.renderer);
    let first = true;
    fixtures.renderer.start = async (input) => {
      if (first) {
        first = false;
        await storeEdit(episode.id, { kind: 'musicMood', mood: 'warm' });
      }
      return start(input);
    };
    try {
      expect(await runRecut(episode.id, runId)).toEqual({ outcome: 'published', planVersion: 3 });
    } finally {
      fixtures.renderer.start = start;
    }
    expect(fixtures.renderer.starts).toHaveLength(2);
    expect(await episodes.get(db(), episode.id)).toMatchObject({
      planVersion: 3,
      renderVersion: 3,
    });
    expect(await episodes.recutOf(db(), episode.id)).toEqual({ state: null, run: null });
  });
});

describe('answers an edit brings in', () => {
  async function swappedIn() {
    const published = await publishedEpisode();
    const { seed, spare, episode } = published;
    // The spare answer's request was closed after an earlier week; it has no original.
    await originalRequests.open(
      seed.db,
      episode.id,
      [{ documentaryId: seed.documentaryId, momentId: spare.momentId, assetId: spare.assetId! }],
      T,
    );
    await originalRequests.closeAll(seed.db, bindings.MEDIA, episode.id, T);
    const edit = await storeEdit(episode.id, {
      kind: 'swapLine',
      sceneIndex: 0,
      with: { kind: 'moment', momentId: spare.momentId },
    });
    return { ...published, ...edit };
  }
  const requestOf = async (episodeId: Uuid, assetId: Uuid) =>
    (await originalRequests.forEpisode(db(), episodeId)).find((r) => r.assetId === assetId);

  it('reopens the request, waits, and renders once the answer arrives', async () => {
    const { seed, spare, episode, runId } = await swappedIn();
    const output = await runRecut(
      episode.id,
      runId,
      async () => {},
      async (instance) => {
        await instance.waitForStepResult({ name: 'recut-originals-v2-0' });
        expect((await requestOf(episode.id, spare.assetId!))?.state).toBe('open');
        expect((await episodes.recutOf(db(), episode.id))?.state).toBe('waiting');
        await putOriginal(seed, spare);
        await originalRequests.meet(db(), spare.assetId!, T);
        await wakeUp(runId);
      },
    );
    expect(output).toEqual({ outcome: 'published', planVersion: 2 });
    expect(JSON.stringify(fixtures.renderer.starts[0]?.manifest)).toContain(spare.assetId);
    expect(await episodes.get(db(), episode.id)).toMatchObject({ renderVersion: 2 });
  });

  it('stops waiting when a newer plan no longer shows the answer, and renders that one', async () => {
    const { spare, episode, runId } = await swappedIn();
    const output = await runRecut(
      episode.id,
      runId,
      async () => {},
      async (instance) => {
        await instance.waitForStepResult({ name: 'recut-originals-v2-0' });
        await storeEdit(episode.id, { kind: 'dropClip', sceneIndex: 0, shotIndex: 0 });
        await wakeUp(runId);
      },
    );
    expect(output).toEqual({ outcome: 'published', planVersion: 3 });
    expect((await requestOf(episode.id, spare.assetId!))?.state).toBe('closed');
    expect(fixtures.renderer.starts).toHaveLength(1);
    expect(JSON.stringify(fixtures.renderer.starts[0]?.manifest)).not.toContain(spare.assetId);
  });

  it('undoes the change when the deadline passes with the request still open', async () => {
    const { seed, spare, episode, runId } = await swappedIn();
    // The answer's file landed but its request is still open when the time runs out.
    await putOriginal(seed, spare);
    await originalRequests.reopen(
      db(),
      episode.id,
      [{ documentaryId: seed.documentaryId, momentId: spare.momentId, assetId: spare.assetId! }],
      T,
    );
    const v1 = (await plans.get(db(), episode.id, 1))!;
    const output = await runRecut(episode.id, runId, async (m) => {
      await m.mockStepResult({ name: 'recut-deadline-v2' }, '2020-01-01T00:00:00.000Z');
      await m.forceEventTimeout({ name: 'recut-wait-v2-0' });
    });
    expect(output).toEqual({ outcome: 'failed' });
    expect(await plans.current(db(), episode.id)).toMatchObject({
      episodeId: episode.id,
      version: 3,
      plan: v1.plan,
      createdBy: 'revert',
    });
    expect(await episodes.recutOf(db(), episode.id)).toEqual({ state: 'failed', run: null });
    const requests = await originalRequests.forEpisode(db(), episode.id);
    expect(requests.filter((r) => r.state === 'open')).toEqual([]);
    expect(await bindings.MEDIA.head(originalKey(seed, spare))).toBeNull();
    expect(await episodes.get(db(), episode.id)).toMatchObject({
      state: 'ready',
      renderVersion: 1,
    });
    expect(await renderFiles(episode.id)).toEqual({ 1: true });
  });
});

describe('a re-cut that fails', () => {
  it('reverts to the published plan when the render fails, and a new edit then runs on its own', async () => {
    const { episode } = await publishedEpisode();
    const { runId } = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    fixtures.renderer.outcomes.push({ state: 'failed', reason: 'render failed' });
    expect(await runRecut(episode.id, runId)).toEqual({ outcome: 'failed' });
    expect(await plans.current(db(), episode.id)).toMatchObject({
      version: 3,
      createdBy: 'revert',
      plan: { title: 'Rain on the tram' },
    });
    expect(await episodes.recutOf(db(), episode.id)).toEqual({ state: 'failed', run: null });
    expect(await episodes.get(db(), episode.id)).toMatchObject({
      state: 'ready',
      renderVersion: 1,
    });

    // The next edit finds the claim empty and claims its own run.
    const next = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram again' });
    expect(next.runId).toBe(`recut-${episode.id}-v4`);
    expect(await runRecut(episode.id, next.runId)).toEqual({
      outcome: 'published',
      planVersion: 4,
    });
    expect(await episodes.recutOf(db(), episode.id)).toEqual({ state: null, run: null });

    // A replayed revert of the old run changes nothing now.
    const before = {
      plans: await planCount(episode.id),
      episode: await episodes.get(db(), episode.id),
      recut: await episodes.recutOf(db(), episode.id),
      requests: await originalRequests.forEpisode(db(), episode.id),
    };
    await revertRecut(recutContext(bindings), episode.id, runId);
    expect({
      plans: await planCount(episode.id),
      episode: await episodes.get(db(), episode.id),
      recut: await episodes.recutOf(db(), episode.id),
      requests: await originalRequests.forEpisode(db(), episode.id),
    }).toEqual(before);
  });

  it('changes nothing when replayed after a new edit claimed v4', async () => {
    const { episode } = await publishedEpisode();
    const { runId } = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    const ctx = recutContext(bindings);
    await revertRecut(ctx, episode.id, runId);
    const next = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram again' });
    expect(next.runId).toBe(`recut-${episode.id}-v4`);
    const before = {
      plans: await planCount(episode.id),
      episode: await episodes.get(db(), episode.id),
      recut: await episodes.recutOf(db(), episode.id),
      requests: await originalRequests.forEpisode(db(), episode.id),
    };
    await revertRecut(ctx, episode.id, runId);
    expect({
      plans: await planCount(episode.id),
      episode: await episodes.get(db(), episode.id),
      recut: await episodes.recutOf(db(), episode.id),
      requests: await originalRequests.forEpisode(db(), episode.id),
    }).toEqual(before);
  });
});

describe('tidying', () => {
  it('deletes a clip original the cut no longer shows and closes its request, keeping the rest', async () => {
    const { seed, week, episode } = await publishedEpisode();
    const { runId } = await storeEdit(episode.id, {
      kind: 'dropClip',
      sceneIndex: 2,
      shotIndex: 0,
    });
    expect(await runRecut(episode.id, runId)).toMatchObject({ outcome: 'published' });
    expect(await bindings.MEDIA.head(originalKey(seed, week.clip))).toBeNull();
    expect(await bindings.MEDIA.head(originalKey(seed, week.photo))).not.toBeNull();
    const requests = await originalRequests.forEpisode(db(), episode.id);
    expect(requests.find((r) => r.assetId === week.clip.assetId)?.state).toBe('closed');
    expect(requests.find((r) => r.assetId === week.photo.assetId)?.state).toBe('met');

    // A replayed replace deletes nothing more and throws nothing.
    const listed = async () =>
      (await bindings.MEDIA.list({ prefix: `u/${seed.userId}/` })).objects.map((o) => o.key);
    const kept = await listed();
    const ctx = recutContext(bindings);
    expect(await tidyOriginals(ctx, episode.id)).toBe(0);
    await dropRenders(ctx, episode.id, 'previous');
    expect(await listed()).toEqual(kept);
  });
});

describe('the version arguments', () => {
  it('startRender with an old version is stale; renderInput draws v1 with its own narration', async () => {
    const { episode } = await publishedEpisode();
    await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    const ctx = renderContext(bindings);
    expect(await startRender(ctx, episode.id, 'portrait', 1)).toEqual({ outcome: 'stale' });
    const current = (await episodes.get(db(), episode.id))!;
    const drawn = JSON.stringify(await renderInput(ctx, current, 'portrait', 1));
    expect(drawn).toContain('Rain on the tram');
    expect(drawn).not.toContain('The tram"');
    expect(drawn).toContain('/narration/');
  });

  it('linesStep with a version works on a ready episode, and fitStep leaves it ready', async () => {
    const { episode } = await publishedEpisode();
    const ctx = narrateContext(bindings);
    expect(await linesStep(ctx, episode.id)).toEqual({ planVersion: 1, indices: [] });
    const lines = await linesStep(ctx, episode.id, 1);
    expect(lines.indices.length).toBeGreaterThan(0);
    await fitStep(ctx, episode.id, 1);
    expect((await episodes.get(db(), episode.id))?.state).toBe('ready');
  });
});

describe('resumeRecuts', () => {
  function stubRecuts(status: string | null) {
    const created: { id: string; params: unknown }[] = [];
    const binding = {
      get: (id: string) =>
        status === null
          ? Promise.reject(new Error(`instance.not_found: ${id}`))
          : Promise.resolve({ status: () => Promise.resolve({ status }) }),
      createBatch: (batch: { id: string; params: unknown }[]) => {
        created.push(...batch);
        return Promise.resolve([]);
      },
    } as unknown as Env['RECUT_PIPELINE'];
    return { binding, created };
  }

  it('creates a missing instance again with the stored run id', async () => {
    const { episode } = await publishedEpisode();
    const { runId } = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    const stub = stubRecuts(null);
    await resumeRecuts({ ...bindings, RECUT_PIPELINE: stub.binding });
    expect(stub.created.filter((c) => c.id === runId)).toEqual([
      { id: runId, params: { episodeId: episode.id, runId } },
    ]);
  });

  it('reverts an errored instance and releases the claim', async () => {
    const { episode } = await publishedEpisode();
    const { runId } = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    const stub = stubRecuts('errored');
    expect(await resumeRecuts({ ...bindings, RECUT_PIPELINE: stub.binding })).toContain(runId);
    expect(await episodes.recutOf(db(), episode.id)).toEqual({ state: 'failed', run: null });
    expect(await plans.current(db(), episode.id)).toMatchObject({
      version: 3,
      createdBy: 'revert',
    });
  });

  it('leaves a running instance alone', async () => {
    const { episode } = await publishedEpisode();
    const { runId } = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    const stub = stubRecuts('running');
    expect(await resumeRecuts({ ...bindings, RECUT_PIPELINE: stub.binding })).not.toContain(runId);
    expect((await episodes.recutOf(db(), episode.id))?.run).toBe(runId);
  });
});

/** A signed-in person with a documentary and a photo moment, synced. */
async function personWithPhoto(email: string, overrides: Partial<Env>) {
  const phone = testApp(overrides);
  const cookie = await phone.signIn(email);
  const me = Me.parse(await (await phone.call('/me', { cookie })).json());
  const documentary = Documentary.parse({
    id: crypto.randomUUID(),
    ownerUserId: me.userId,
    title: 'My documentary',
    kind: 'solo',
    timeZone: 'Europe/Berlin',
    episodeDay: 0,
    episodeHour: 18,
    createdAt: T0,
    updatedAt: T0,
  });
  expect((await phone.post('/documentaries/link', documentary, cookie)).status).toBe(200);
  const assetId = Uuid.parse(crypto.randomUUID());
  const momentId = Uuid.parse(crypto.randomUUID());
  const asset = SyncChange.parse({
    entity: 'mediaAsset',
    row: {
      id: assetId,
      ownerUserId: me.userId,
      kind: 'photo',
      width: 1080,
      height: 1920,
      bytes: 1000,
      sha256: 'a'.repeat(64),
      createdAt: T0,
    },
  });
  const moment = {
    id: momentId,
    documentaryId: documentary.id,
    authorUserId: me.userId,
    capturedAt: T0,
    timeZone: 'Europe/Berlin',
    kind: 'photo',
    mediaAssetId: assetId,
    localOnly: false,
    storylineIds: [],
    castIds: [],
    updatedAt: T0,
  };
  const synced = await phone.post(
    '/sync',
    {
      documentaryId: documentary.id,
      cursor: null,
      changes: [asset, { entity: 'moment', row: moment }],
    },
    cookie,
  );
  expect(synced.status).toBe(200);
  const episode = await episodes.getOrCreate(db(), documentary.id, WEEK, T);
  await originalRequests.open(
    db(),
    episode.id,
    [{ documentaryId: documentary.id, momentId, assetId }],
    T,
  );
  const upload = async () => {
    const created = await phone.post(
      '/uploads',
      { assetId, purpose: 'original', contentType: 'image/jpeg', bytes: 1000 },
      cookie,
    );
    expect(created.status).toBe(200);
    const put = await phone.call(`/uploads/${assetId}/original/parts/1`, {
      method: 'PUT',
      body: new Uint8Array(1000).fill(3),
      headers: { 'content-length': '1000' },
      cookie,
    });
    expect(put.status).toBe(200);
    return phone.post(
      `/uploads/${assetId}/original/complete`,
      { parts: [UploadedPart.parse(await put.json())] },
      cookie,
    );
  };
  return { episode, upload };
}

function stubRun(fails = false) {
  const events: { id: string; type: string }[] = [];
  const binding = {
    get: (id: string) =>
      Promise.resolve({
        sendEvent: ({ type }: { type: string }) => {
          if (fails) return Promise.reject(new Error('The instance is not running.'));
          events.push({ id, type });
          return Promise.resolve();
        },
      }),
  } as unknown as Env['RECUT_PIPELINE'] & Env['EPISODE_PIPELINE'];
  return { binding, events };
}

describe('the upload route during a re-cut', () => {
  const claim = (episodeId: Uuid, runId: string) =>
    bindings.DB.prepare('UPDATE episodes SET recut_run = ? WHERE id = ?')
      .bind(runId, episodeId)
      .run();

  it('sends originals-ready to the re-cut run when the last original arrives', async () => {
    const weekly = stubRun();
    const recut = stubRun();
    const p = await personWithPhoto('recut.upload@example.com', {
      EPISODE_PIPELINE: weekly.binding,
      RECUT_PIPELINE: recut.binding,
    });
    await claim(p.episode.id, `recut-${p.episode.id}-v2`);
    expect((await p.upload()).status).toBe(200);
    expect(recut.events).toEqual([{ id: `recut-${p.episode.id}-v2`, type: 'originals-ready' }]);
  });

  it('answers 200 and still tells the re-cut run when the weekly run throws', async () => {
    const weekly = stubRun(true);
    const recut = stubRun();
    const p = await personWithPhoto('recut.upload.throws@example.com', {
      EPISODE_PIPELINE: weekly.binding,
      RECUT_PIPELINE: recut.binding,
    });
    await claim(p.episode.id, `recut-${p.episode.id}-v2`);
    expect((await p.upload()).status).toBe(200);
    expect(recut.events).toHaveLength(1);
  });
});

describe('the video route with a render version', () => {
  it('serves v1 while v2 is published, 404 once dropped; without v it serves v2', async () => {
    const { seed, episode } = await publishedEpisode();
    await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    const ctx = renderContext(bindings);
    const started = await startRender(ctx, episode.id, 'portrait', 2);
    if (started.outcome !== 'started') throw new Error('The render did not start.');
    await checkRender(ctx, started.id);
    const rows = await renders.forEpisode(db(), episode.id);
    const v1 = new Uint8Array(500).fill(1);
    const v2 = new Uint8Array(600).fill(2);
    await bindings.MEDIA.put(rows.find((r) => r.renderVersion === 1)!.outKey, v1);
    await bindings.MEDIA.put(rows.find((r) => r.renderVersion === 2)!.outKey, v2);

    const phone = testApp();
    const cookie = await phone.signIn('recut.video@example.com');
    const me = Me.parse(await (await phone.call('/me', { cookie })).json());
    await bindings.DB.prepare('UPDATE documentaries SET owner_user_id = ? WHERE id = ?')
      .bind(me.userId, seed.documentaryId)
      .run();
    const video = (query = '') => phone.call(`/episodes/${episode.id}/video${query}`, { cookie });

    const old = await video('?v=1');
    expect(old.status).toBe(200);
    expect(new Uint8Array(await old.arrayBuffer())).toEqual(v1);
    const now = await video();
    expect(new Uint8Array(await now.arrayBuffer())).toEqual(v2);
    await dropRenders(recutContext(bindings), episode.id, 'current');
    const gone = await video('?v=1');
    expect(gone.status).toBe(404);
    await gone.arrayBuffer();
  });
});

describe('briefs and sync', () => {
  async function planned(seed: Seed, createdBy: 'model' | 'recap', summary: string) {
    const week = await seed.fullWeek();
    const episode = await episodes.getOrCreate(seed.db, seed.documentaryId, WEEK, T);
    const brief = weekBrief(await briefInput(seed.db, episode));
    const plan = assemblePlan(
      PlannerOutput.parse({
        title: 'Rain on the tram',
        coldOpen: { momentId: week.videoAnswer.momentId },
        scenes: [
          { heading: 'Wednesday', shots: [{ momentId: week.voiceAnswer.momentId }] },
          { heading: 'Out', shots: [{ momentId: week.photo.momentId }] },
          { heading: 'Home', shots: [{ momentId: week.clip.momentId }] },
        ],
        closing: { momentId: week.photo.momentId },
        musicMood: 'calm',
        lowerThirds: [],
        summary,
      }),
      brief,
      { narratorVoiceId: 'narrator-1' },
    );
    await plans.put(seed.db, { episodeId: episode.id, version: 1, plan, createdBy, createdAt: T });
    await plans.put(seed.db, {
      episodeId: episode.id,
      version: 2,
      plan: { ...plan, title: 'Edited' },
      createdBy: 'edit',
      createdAt: T,
    });
    await episodes.setPlan(seed.db, episode.id, { version: 2, summary, state: 'ready' }, T);
    return episode;
  }

  it("carries an edited model episode's summary to the next week, never an edited recap's", async () => {
    const modelSeed = await seedDocumentary();
    await planned(modelSeed, 'model', 'They rode the tram.');
    const recapSeed = await seedDocumentary();
    await planned(recapSeed, 'recap', 'A week of photos.');
    const next = async (seed: Seed) =>
      previousSummaries(
        seed.db,
        await episodes.getOrCreate(seed.db, seed.documentaryId, '2027-03-22', T),
      );
    expect(await next(modelSeed)).toEqual(['They rode the tram.']);
    expect(await next(recapSeed)).toEqual([]);
  });

  it('a pulled summary carries recut', async () => {
    const { episode } = await publishedEpisode();
    const { runId } = await storeEdit(episode.id, { kind: 'retitle', title: 'The tram' });
    await episodes.setRecutState(db(), episode.id, runId, 'waiting', T);
    const [summary] = await episodes.summaries(db(), [episode.id]);
    expect(summary).toMatchObject({ title: 'The tram', recut: 'waiting' });
    await episodes.setRecutState(db(), episode.id, 'recut-someone-else', 'failed', T);
    expect((await episodes.summaries(db(), [episode.id]))[0]?.recut).toBe('waiting');
  });
});

describe('migration 0012', () => {
  it('adds the recut columns and recut_narration, unique by episode and version', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0012_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0012_'));
    expect(next).toHaveLength(1);
    await applyD1Migrations(MIGRATION_DB, before);
    await MIGRATION_DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES ('u1', '', 'u1@example.com', 1)",
    ).run();
    await MIGRATION_DB.prepare(
      `INSERT INTO documentaries (id, owner_user_id, title, kind, time_zone, episode_day, episode_hour, created_at, updated_at)
       VALUES ('d1', 'u1', 'Mine', 'solo', 'Europe/Berlin', 0, 18, ?, ?)`,
    )
      .bind(T, T)
      .run();
    await MIGRATION_DB.prepare(
      `INSERT INTO episodes (id, documentary_id, number, week_start, week_end, state, plan_version, render_version, cost_cents, updated_at)
       VALUES ('e1', 'd1', 1, '2027-03-15', '2027-03-21', 'ready', 1, 1, 0, ?)`,
    )
      .bind(T)
      .run();
    await applyD1Migrations(MIGRATION_DB, next);
    const row = await MIGRATION_DB.prepare(
      "SELECT state, recut_state, recut_run FROM episodes WHERE id = 'e1'",
    ).first();
    expect(row).toEqual({ state: 'ready', recut_state: null, recut_run: null });
    const insert = (version: number) =>
      MIGRATION_DB.prepare(
        "INSERT INTO recut_narration (episode_id, plan_version, characters) VALUES ('e1', ?, 10)",
      )
        .bind(version)
        .run();
    await insert(2);
    await insert(3);
    await expect(insert(2)).rejects.toThrow();
  });
});
