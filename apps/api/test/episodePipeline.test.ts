import { introspectWorkflowInstance } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { database } from '../src/data/db';
import * as episodes from '../src/data/repositories/episodes';
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
  it('completes with the episode in planning and its cost set', async () => {
    const seed = await seedDocumentary();
    await seed.fullWeek();
    const output = await runWeek(seed.documentaryId);
    expect(output).toMatchObject({ transcribed: 2, captioned: 3, costCents: 1 });
    expect(await episodeOf(seed.documentaryId)).toMatchObject({ state: 'planning', costCents: 1 });
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
    expect(await episodeOf(seed.documentaryId)).toMatchObject({ state: 'planning' });
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
    expect(await episodeOf(seed.documentaryId)).toMatchObject({ state: 'planning' });
  });

  it('makes one instance when the week is started twice', async () => {
    const seed = await seedDocumentary();
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
