import { introspectWorkflowInstance } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerOutput } from '@life/contracts';
import { database } from '../src/data/db';
import * as costLedger from '../src/data/repositories/costLedger';
import * as episodes from '../src/data/repositories/episodes';
import * as plans from '../src/data/repositories/plans';
import { episodeInstanceId, startEpisodePipeline } from '../src/pipeline/EpisodePipeline';
import { CAPTIONING_NOT_SET_UP } from '../src/providers';
import { fixtures } from '../src/providers/fixture';
import { bindings } from './session';
import { WEEK, seedDocumentary } from './understandSeed';

beforeEach(() => fixtures.reset());

/** Runs the week's pipeline with sleeps and retry delays off; `extra` adds modifications. */
async function runWeek(
  documentaryId: string,
  extra: (
    m: Parameters<
      Parameters<Awaited<ReturnType<typeof introspectWorkflowInstance>>['modify']>[0]
    >[0],
  ) => Promise<void> = async () => {},
) {
  const id = episodeInstanceId(documentaryId, WEEK);
  const instance = await introspectWorkflowInstance(bindings.EPISODE_PIPELINE, id);
  try {
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
      await extra(m);
    });
    await startEpisodePipeline(bindings, documentaryId as never, WEEK);
    await instance.waitForStatus('complete');
    return await instance.getOutput();
  } finally {
    await instance.dispose();
  }
}

const episodeOf = async (documentaryId: string) => {
  const [row] = (
    await bindings.DB.prepare('SELECT id FROM episodes WHERE documentary_id = ?')
      .bind(documentaryId)
      .all<{ id: string }>()
  ).results;
  return episodes.get(database(bindings.DB), row!.id as never);
};

describe('EpisodePipeline', () => {
  it('completes with the episode planned and its cost set', async () => {
    const seed = await seedDocumentary();
    await seed.fullWeek();
    const output = await runWeek(seed.documentaryId);
    expect(output).toMatchObject({ transcribed: 2, captioned: 3, costCents: 1 });
    // The fixture planner has no answer set, so it throws and the week gets the recap.
    expect(await episodeOf(seed.documentaryId)).toMatchObject({ state: 'rendering', costCents: 1 });
    expect(await seed.derivedRows()).toHaveLength(5);
    expect(await seed.workingCopies()).toEqual([]);
  });

  it('checks a batch that never ends 24 times, cancels it, deletes it once ended and keeps the transcripts', async () => {
    const seed = await seedDocumentary();
    await seed.fullWeek();
    fixtures.captioner.stayInProgress = true;
    const output = await runWeek(seed.documentaryId);
    const calls = fixtures.captioner.calls;
    const cancelAt = calls.findIndex((c) => c.startsWith('cancel:'));
    expect(cancelAt).toBeGreaterThan(0);
    expect(calls.slice(0, cancelAt).filter((c) => c.startsWith('status:'))).toHaveLength(24);
    expect(calls.filter((c) => c.startsWith('remove:'))).toHaveLength(1);
    expect(calls.indexOf(calls.find((c) => c.startsWith('remove:'))!)).toBeGreaterThan(cancelAt);
    expect(output).toMatchObject({ transcribed: 2, captioned: 0 });
    const rows = await seed.derivedRows();
    expect(rows.map((r) => r.provider)).toEqual(['workersAi', 'workersAi']);
    expect(await episodeOf(seed.documentaryId)).toMatchObject({ state: 'rendering' });
  });

  it('leaves an answer whose transcription always fails without a transcript and does the rest', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    const output = await runWeek(seed.documentaryId, async (m) => {
      await m.mockStepError(
        { name: `transcribe-${week.voiceAnswer.momentId}` },
        new Error('Workers AI is down'),
      );
    });
    expect(output).toMatchObject({ transcribed: 1, captioned: 3 });
    const rows = await seed.derivedRows();
    expect(rows.filter((r) => r.momentId === week.voiceAnswer.momentId)).toEqual([]);
    expect(rows.filter((r) => r.provider === 'workersAi').map((r) => r.momentId)).toEqual([
      week.videoAnswer.momentId,
    ]);
    expect(await seed.workingCopies()).toEqual([]);
  });

  it('completes with transcripts and no captions when captioning is not set up', async () => {
    const seed = await seedDocumentary();
    await seed.fullWeek();
    fixtures.captioner.failSubmit = new Error(CAPTIONING_NOT_SET_UP);
    const output = await runWeek(seed.documentaryId);
    expect(output).toMatchObject({ transcribed: 2, captioned: 0 });
    expect((await seed.derivedRows()).map((r) => r.provider)).toEqual(['workersAi', 'workersAi']);
    expect(fixtures.captioner.calls).toEqual(['submit:failed']);
    expect(await episodeOf(seed.documentaryId)).toMatchObject({ state: 'rendering' });
  });

  it('makes one instance when the week is started twice', async () => {
    const seed = await seedDocumentary();
    // A week with a photo keeps its episode (a week with nothing to show has none, D2).
    await seed.add('photo');
    const id = episodeInstanceId(seed.documentaryId, WEEK);
    const instance = await introspectWorkflowInstance(bindings.EPISODE_PIPELINE, id);
    try {
      await instance.modify(async (m) => {
        await m.disableSleeps();
      });
      const first = await startEpisodePipeline(bindings, seed.documentaryId, WEEK);
      const second = await startEpisodePipeline(bindings, seed.documentaryId, WEEK);
      expect(first.id).toBe(id);
      expect(second.id).toBe(id);
      await instance.waitForStatus('complete');
      const rows = await bindings.DB.prepare(
        'SELECT COUNT(*) AS n FROM episodes WHERE documentary_id = ?',
      )
        .bind(seed.documentaryId)
        .first<{ n: number }>();
      expect(rows?.n).toBe(1);
    } finally {
      await instance.dispose();
    }
  });
});

describe('EpisodePipeline planning', () => {
  const answerFor = (
    week: Awaited<ReturnType<Awaited<ReturnType<typeof seedDocumentary>>['fullWeek']>>,
  ) =>
    JSON.stringify(
      PlannerOutput.parse({
        title: 'Rain on the tram',
        coldOpen: { momentId: week.videoAnswer.momentId },
        scenes: [
          { heading: 'Wednesday', shots: [{ momentId: week.voiceAnswer.momentId }] },
          { heading: 'Out', shots: [{ momentId: week.photo.momentId }] },
          {
            heading: 'Home again',
            shots: [{ momentId: week.clip.momentId }, { momentId: week.videoAnswer.momentId }],
          },
        ],
        closing: { momentId: week.photo.momentId },
        musicMood: 'calm',
        lowerThirds: [],
        summary: 'They rode the tram and took a photo.',
      }),
    );
  const first = {
    inputTokens: 18_000,
    outputTokens: 2500,
    cacheWriteTokens: 0,
    cacheReadTokens: 1300,
  };
  const second = {
    inputTokens: 20_000,
    outputTokens: 3000,
    cacheWriteTokens: 4000,
    cacheReadTokens: 0,
  };

  it('stores the model plan and sets the plan version, the summary and the state', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push({ text: answerFor(week), stopReason: 'end_turn', usage: first });
    const output = await runWeek(seed.documentaryId);
    expect(output).toMatchObject({ plan: 'model' });
    const episode = await episodeOf(seed.documentaryId);
    expect(episode).toMatchObject({
      planVersion: 1,
      summary: 'They rode the tram and took a photo.',
      state: 'rendering',
    });
    expect(await plans.current(database(bindings.DB), episode!.id)).toMatchObject({
      createdBy: 'model',
    });
  });

  it('gives the recap when the planner throws on every attempt', async () => {
    const seed = await seedDocumentary();
    await seed.fullWeek();
    fixtures.planner.answers.push(new Error('Overloaded'), new Error('Overloaded'));
    const output = await runWeek(seed.documentaryId);
    expect(output).toMatchObject({ plan: 'recap' });
    expect(fixtures.planner.calls).toHaveLength(2);
    const episode = await episodeOf(seed.documentaryId);
    expect(await plans.current(database(bindings.DB), episode!.id)).toMatchObject({
      version: 1,
      createdBy: 'recap',
    });
  });

  it('records both calls in the plan ledger rows and the episode cost', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push(
      { text: '{"title":"Rain', stopReason: 'max_tokens', usage: first },
      { text: answerFor(week), stopReason: 'end_turn', usage: second },
    );
    const output = await runWeek(seed.documentaryId);
    expect(output).toMatchObject({ plan: 'model' });
    const episode = await episodeOf(seed.documentaryId);
    const rows = await costLedger.forEpisode(database(bindings.DB), episode!.id);
    const planRows = rows
      .filter((r) => r.step === 'plan')
      .map(({ unit, units, microUsd }) => ({ unit, units, microUsd }))
      .sort((a, b) => a.unit.localeCompare(b.unit));
    expect(planRows).toEqual([
      { unit: 'cacheReadToken', units: 1300, microUsd: 260 },
      { unit: 'cacheWriteToken', units: 4000, microUsd: 16_000 },
      { unit: 'inputToken', units: 38_000, microUsd: 76_000 },
      { unit: 'outputToken', units: 5500, microUsd: 55_000 },
    ]);
    const total = rows.reduce((sum, r) => sum + r.microUsd, 0);
    expect(episode?.costCents).toBe(Math.ceil(total / 10_000));
    expect(episode?.costCents).toBeGreaterThanOrEqual(15);
    expect(output).toMatchObject({ costCents: episode?.costCents });
  });

  it('ends with one plan and one set of plan rows when plan-costs fails once', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push({ text: answerFor(week), stopReason: 'end_turn', usage: first });
    await runWeek(seed.documentaryId, async (m) => {
      await m.mockStepError({ name: 'plan-costs' }, new Error('D1 is busy'), 1);
    });
    const episode = await episodeOf(seed.documentaryId);
    const planCount = await bindings.DB.prepare(
      'SELECT COUNT(*) AS n FROM episode_plans WHERE episode_id = ?',
    )
      .bind(episode!.id)
      .first<{ n: number }>();
    expect(planCount?.n).toBe(1);
    const rows = (await costLedger.forEpisode(database(bindings.DB), episode!.id)).filter(
      (r) => r.step === 'plan',
    );
    expect(rows.map((r) => r.unit).sort()).toEqual(['cacheReadToken', 'inputToken', 'outputToken']);
  });

  it('removes the episode of a notes-only week without a planner call', async () => {
    const seed = await seedDocumentary();
    await seed.add('note');
    const output = await runWeek(seed.documentaryId);
    expect(output).toMatchObject({ plan: 'empty', costCents: 0 });
    expect(fixtures.planner.calls).toEqual([]);
    const left = await bindings.DB.prepare(
      'SELECT COUNT(*) AS n FROM episodes WHERE documentary_id = ?',
    )
      .bind(seed.documentaryId)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
