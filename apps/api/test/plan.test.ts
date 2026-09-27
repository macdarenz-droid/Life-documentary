import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { PlannerOutput, Uuid, WeekBriefV1, type EpisodePlanV1 } from '@life/contracts';
import { assemblePlan } from '@life/story';
import { beforeEach, describe, expect, it } from 'vitest';
import * as briefRepo from '../src/data/repositories/brief';
import * as costLedger from '../src/data/repositories/costLedger';
import * as episodes from '../src/data/repositories/episodes';
import * as plans from '../src/data/repositories/plans';
import { RETRY_HEADING, planOnce } from '../src/pipeline/plan/planOnce';
import { planContext, planStep, recapStep } from '../src/pipeline/plan/steps';
import type { PlanAnswer, PlanUsage } from '../src/pipeline/ports';
import { fixtures } from '../src/providers/fixture';
import { bindings } from './session';
import { WEEK, seedDocumentary } from './understandSeed';

beforeEach(() => fixtures.reset());

const id = (n: number) => Uuid.parse(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const CAST = id(90);
const [A1, A2, A3, C1, C2, P1, N1] = [1, 2, 3, 4, 5, 6, 7].map(id) as [
  Uuid,
  Uuid,
  Uuid,
  Uuid,
  Uuid,
  Uuid,
  Uuid,
];
const TRANSCRIPT = 'We walked down to the harbour and bought fresh bread for the week.';
const NOTE = 'Rain all day and the gutter overflowed again.';

type Moment = WeekBriefV1['moments'][number];
const moment = (momentId: Uuid, kind: Moment['kind'], extra: Partial<Moment> = {}): Moment => ({
  momentId,
  day: '2027-03-02',
  weekday: 'Tuesday',
  kind,
  storylineIds: [],
  castIds: [],
  ...extra,
});

const brief = WeekBriefV1.parse({
  version: 1,
  documentaryId: id(100),
  episodeNumber: 4,
  weekStart: '2027-03-01',
  weekEnd: '2027-03-07',
  timeZone: 'Europe/London',
  moments: [
    moment(A1, 'answer', { durationMs: 8000, transcript: TRANSCRIPT }),
    moment(A2, 'answer'),
    moment(A3, 'answer', { durationMs: 5000, castIds: [CAST] }),
    moment(C1, 'clip', { durationMs: 10_000 }),
    moment(C2, 'clip', { durationMs: 4000 }),
    moment(P1, 'photo', { castIds: [CAST] }),
    moment(N1, 'note', { text: NOTE }),
  ],
  storylines: [],
  cast: [{ id: CAST, name: 'Maya' }],
  previousSummaries: ['They moved into the flat by the canal.'],
  questionsAsked: [],
});

const output: PlannerOutput = PlannerOutput.parse({
  title: 'Bread from the harbour',
  coldOpen: { momentId: A3 },
  scenes: [
    { heading: 'Tuesday', shots: [{ momentId: A2 }, { momentId: C1 }] },
    {
      heading: 'At the allotment',
      shots: [{ momentId: P1 }, { momentId: C2 }],
      narratorBridge: { text: 'Saturday, at the allotment.' },
    },
    { heading: 'Home again', shots: [{ momentId: A1 }] },
  ],
  closing: { momentId: P1 },
  musicMood: 'warm',
  lowerThirds: [{ momentId: P1, castId: CAST }],
  summary: 'They went to the harbour and the allotment.',
});

const usage = (n: number): PlanUsage => ({
  inputTokens: n,
  outputTokens: n,
  cacheWriteTokens: 0,
  cacheReadTokens: n,
});
const answer = (o: unknown, n = 10): PlanAnswer => ({
  text: JSON.stringify(o),
  stopReason: 'end_turn',
  usage: usage(n),
});
const SECRET_TITLE = 'Unforgettable journey, the harbour at dawn';
const badTitle = { ...output, title: SECRET_TITLE };
const copied = {
  ...output,
  scenes: output.scenes.map((s, i) =>
    i === 1 ? { ...s, narratorBridge: { text: 'We walked down to the harbour.' } } : s,
  ),
};

describe('planOnce', () => {
  it('makes one call for a valid first answer and gives the model plan', async () => {
    fixtures.planner.answers.push(answer(output));
    const result = await planOnce(brief, fixtures.planner);
    expect(result).toMatchObject({ outcome: 'model', calls: 1, usage: usage(10) });
    expect(fixtures.planner.calls).toHaveLength(1);
    const [call] = fixtures.planner.calls;
    expect(call).toMatchObject({ model: 'claude-sonnet-5', effort: 'medium', maxTokens: 16000 });
    expect(call?.messages).toEqual([{ role: 'user', text: JSON.stringify(brief) }]);
    if (result.outcome !== 'model') throw new Error('expected a model plan');
    expect(result.plan.narratorVoiceId).toBe('narrator-1');
    expect(result.plan.summary).toBe(output.summary);
  });

  it('retries an invalid answer once as a conversation and takes the second', async () => {
    const first = answer(badTitle, 10);
    fixtures.planner.answers.push(first, answer(output, 20));
    const result = await planOnce(brief, fixtures.planner);
    expect(result).toMatchObject({ outcome: 'model', calls: 2, usage: usage(30) });
    const second = fixtures.planner.calls[1]!;
    expect(second.messages).toHaveLength(3);
    expect(second.messages[0]).toEqual({ role: 'user', text: JSON.stringify(brief) });
    expect(second.messages[1]).toEqual({ role: 'assistant', text: first.text });
    expect(second.messages[2]).toEqual({
      role: 'user',
      text: [RETRY_HEADING, 'title uses "journey"'].join('\n'),
    });
  });

  it("gives invalid with the second answer's errors after two invalid answers", async () => {
    fixtures.planner.answers.push(
      answer(badTitle),
      answer({ ...output, closing: { momentId: N1 } }),
    );
    const result = await planOnce(brief, fixtures.planner);
    expect(result).toMatchObject({
      outcome: 'invalid',
      calls: 2,
      errors: ['closing: not a picture or sound from this week'],
    });
  });

  it('stops at a refusal with one call', async () => {
    fixtures.planner.answers.push({ stopReason: 'refusal', usage: usage(5) }, answer(output));
    const result = await planOnce(brief, fixtures.planner);
    expect(result).toMatchObject({ outcome: 'refused', calls: 1, usage: usage(5) });
    expect(fixtures.planner.calls).toHaveLength(1);
  });

  it('retries a cut-off answer and a copied bridge', async () => {
    fixtures.planner.answers.push(
      { text: '{"title":"Bre', stopReason: 'max_tokens', usage: usage(1) },
      answer(output),
    );
    expect((await planOnce(brief, fixtures.planner)).outcome).toBe('model');
    expect(fixtures.planner.calls[1]?.messages.at(-1)?.text).toBe(
      `${RETRY_HEADING}\nThe answer was cut off.`,
    );

    fixtures.reset();
    fixtures.planner.answers.push(answer(copied), answer(output));
    expect((await planOnce(brief, fixtures.planner)).outcome).toBe('model');
    expect(fixtures.planner.calls[1]?.messages.at(-1)?.text).toBe(
      `${RETRY_HEADING}\nscene 1 bridge repeats the person's words`,
    );
  });

  it('sends the errors after the brief in one message when the first answer had no text', async () => {
    fixtures.planner.answers.push({ stopReason: 'end_turn', usage: usage(1) }, answer(output));
    expect((await planOnce(brief, fixtures.planner)).outcome).toBe('model');
    expect(fixtures.planner.calls[1]?.messages).toEqual([
      {
        role: 'user',
        text: `${JSON.stringify(brief)}\n\n${RETRY_HEADING}\nThe answer had no text.`,
      },
    ]);
  });

  it('gives invalid with the usage so far when the retry call fails, and throws when the first does', async () => {
    fixtures.planner.answers.push(answer(badTitle, 7), new Error('Overloaded'));
    expect(await planOnce(brief, fixtures.planner)).toMatchObject({
      outcome: 'invalid',
      usage: usage(7),
    });
    fixtures.planner.answers.push(new Error('Overloaded'));
    await expect(planOnce(brief, fixtures.planner)).rejects.toThrow('Overloaded');
  });

  it('passes the effort it is given', async () => {
    fixtures.planner.answers.push(answer(output));
    await planOnce(brief, fixtures.planner, { effort: 'high' });
    expect(fixtures.planner.calls[0]?.effort).toBe('high');
  });

  it('names fields and ids in its errors, never words from the brief or the answer', async () => {
    const bad: unknown[] = [
      badTitle,
      copied,
      'not json at all, the harbour',
      { ...output, musicMood: 'jubilant harbour mood' },
      { ...output, closing: { momentId: id(999) } },
      { ...output, scenes: output.scenes.slice(0, 1) },
      {
        ...output,
        scenes: [
          { heading: 'A short week — at home', shots: [{ momentId: P1 }] },
          ...output.scenes.slice(0, 2),
        ],
      },
    ];
    const texts = new Set<string>();
    const collect = (value: unknown): void => {
      if (typeof value === 'string') {
        if (!/^[0-9a-f-]{36}$/.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value)) texts.add(value);
      } else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(brief);
    bad.forEach(collect);
    const errors: string[] = [];
    for (const o of bad) {
      fixtures.reset();
      fixtures.planner.answers.push(
        typeof o === 'string' ? { text: o, stopReason: 'end_turn', usage: usage(1) } : answer(o),
        { stopReason: 'end_turn', usage: usage(1) },
      );
      await planOnce(brief, fixtures.planner);
      const retry = fixtures.planner.calls[1]?.messages.at(-1)?.text ?? '';
      errors.push(...retry.split('\n').slice(1));
    }
    expect(errors.length).toBeGreaterThanOrEqual(bad.length);
    for (const error of errors) {
      for (const text of texts) {
        if (text.length >= 8) expect(error).not.toContain(text);
      }
    }
  });
});

/** A plan to store: the planOnce fixture plan. */
const samplePlan = (summary: string): EpisodePlanV1 => ({
  ...assemblePlan(output, brief, { narratorVoiceId: 'narrator-1' }),
  summary,
});

describe('previousSummaries', () => {
  async function episodesWith(createdBy: ('model' | 'recap')[]) {
    const seed = await seedDocumentary();
    const made = [];
    for (const [i, by] of createdBy.entries()) {
      const weekStart = `2027-0${1 + Math.floor(i / 4)}-0${1 + (i % 4) * 7}`.replace(
        /-0(\d\d)$/,
        '-$1',
      );
      const episode = await episodes.getOrCreate(
        seed.db,
        seed.documentaryId,
        weekStart,
        '2027-03-01T00:00:00.000Z',
      );
      await plans.put(seed.db, {
        episodeId: episode.id,
        version: 1,
        plan: samplePlan(`Summary ${episode.number}.`),
        createdBy: by,
        createdAt: '2027-03-01T00:00:00.000Z',
      });
      await episodes.setPlan(
        seed.db,
        episode.id,
        { version: 1, summary: `Summary ${episode.number}.`, state: 'rendering' },
        '2027-03-01T00:00:00.000Z',
      );
      made.push(episode);
    }
    const next = await episodes.getOrCreate(
      seed.db,
      seed.documentaryId,
      '2027-06-07',
      '2027-06-01T00:00:00.000Z',
    );
    return { seed, next };
  }

  it('carries the summaries of earlier model plans, oldest first, and leaves out a recap one', async () => {
    const { seed, next } = await episodesWith(['model', 'recap', 'model']);
    expect(next.number).toBe(4);
    expect(await briefRepo.previousSummaries(seed.db, next)).toEqual(['Summary 1.', 'Summary 3.']);
    expect((await briefRepo.briefInput(seed.db, next)).previousSummaries).toEqual([
      'Summary 1.',
      'Summary 3.',
    ]);
  });

  it('keeps the last three', async () => {
    const { seed, next } = await episodesWith(['model', 'model', 'model', 'model']);
    expect(await briefRepo.previousSummaries(seed.db, next)).toEqual([
      'Summary 2.',
      'Summary 3.',
      'Summary 4.',
    ]);
  });
});

describe('the plan steps', () => {
  const ctx = () => planContext(bindings);
  const T = '2027-03-21T18:00:00.000Z';

  async function weekWith(
    kinds: Parameters<Awaited<ReturnType<typeof seedDocumentary>>['add']>[0][],
  ) {
    const seed = await seedDocumentary();
    const added = [];
    for (const kind of kinds) added.push(await seed.add(kind));
    const episode = await episodes.getOrCreate(seed.db, seed.documentaryId, WEEK, T);
    return { seed, added, episode };
  }

  const count = async (table: string, episodeId: string) =>
    (
      await bindings.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE episode_id = ?`)
        .bind(episodeId)
        .first<{ n: number }>()
    )?.n;

  function plannerOutputFor(
    ids: { answer: Uuid; answer2: Uuid; photo: Uuid; clip: Uuid },
    bridge = false,
  ) {
    return PlannerOutput.parse({
      title: 'Rain on the tram',
      coldOpen: { momentId: ids.answer },
      scenes: [
        {
          heading: 'Wednesday',
          shots: [{ momentId: ids.answer2 }],
          ...(bridge ? { narratorBridge: { text: 'Wednesday, at home.' } } : {}),
        },
        { heading: 'Out', shots: [{ momentId: ids.photo }] },
        { heading: 'Home again', shots: [{ momentId: ids.clip }, { momentId: ids.answer }] },
      ],
      closing: { momentId: ids.photo },
      musicMood: 'calm',
      lowerThirds: [],
      summary: 'They rode the tram and took a photo.',
    });
  }

  it('stores a model plan and points the episode at it, with its summary and state', async () => {
    const { added, episode } = await weekWith([
      'videoAnswer',
      'voiceAnswer',
      'photo',
      'clip',
      'note',
    ]);
    const [a, b, p, c] = added.map((s) => s.momentId) as [Uuid, Uuid, Uuid, Uuid];
    fixtures.planner.answers.push(
      answer(plannerOutputFor({ answer: a, answer2: b, photo: p, clip: c }, true)),
    );
    const result = await planStep(ctx(), episode.id);
    expect(result).toMatchObject({ outcome: 'model', usage: usage(10) });
    const stored = await plans.current(ctx().db, episode.id);
    expect(stored).toMatchObject({ version: 1, createdBy: 'model' });
    expect(stored?.plan.narratorVoiceId).toBe('narrator-1');
    expect(await episodes.get(ctx().db, episode.id)).toMatchObject({
      planVersion: 1,
      summary: 'They rode the tram and took a photo.',
      state: 'narrating',
    });
  });

  it('never sends a local-only moment’s note or transcript to the planner', async () => {
    const { seed, added, episode } = await weekWith([
      'videoAnswer',
      'voiceAnswer',
      'photo',
      'clip',
      'note',
    ]);
    const hiddenNote = await seed.add('note', { localOnly: true });
    await bindings.DB.prepare('UPDATE moments SET text = ? WHERE id = ?')
      .bind('The private letter from the bank.', hiddenNote.momentId)
      .run();
    const hiddenAnswer = await seed.add('videoAnswer', { localOnly: true });
    await bindings.DB.prepare(
      `INSERT INTO derived (id, documentary_id, moment_id, transcript, language, provider, model_version, produced_at)
       VALUES (?, ?, ?, 'The secret I told nobody.', 'en', 'workersAi', 'fixture-1', ?)`,
    )
      .bind(crypto.randomUUID(), seed.documentaryId, hiddenAnswer.momentId, T)
      .run();
    const [a, b, p, c] = added.map((s) => s.momentId) as [Uuid, Uuid, Uuid, Uuid];
    fixtures.planner.answers.push(
      answer(plannerOutputFor({ answer: a, answer2: b, photo: p, clip: c })),
    );
    expect((await planStep(ctx(), episode.id)).outcome).toBe('model');
    const sent = JSON.stringify(fixtures.planner.calls);
    expect(sent).toContain('Rain on the tram window.');
    expect(sent).not.toContain('The private letter from the bank.');
    expect(sent).not.toContain('The secret I told nobody.');
    expect(sent).not.toContain(hiddenAnswer.momentId);
    expect(await episodes.get(ctx().db, episode.id)).toMatchObject({ state: 'rendering' });
  });

  it('gives the recap without a planner call to a week with photos and clips but no answer', async () => {
    const { episode } = await weekWith(['photo', 'clip', 'photo']);
    expect(await planStep(ctx(), episode.id)).toEqual({ outcome: 'recap-needed' });
    expect(fixtures.planner.calls).toEqual([]);
    expect(await recapStep(ctx(), episode.id)).toBe('recap');
    expect(await plans.current(ctx().db, episode.id)).toMatchObject({
      version: 1,
      createdBy: 'recap',
    });
    expect(await episodes.get(ctx().db, episode.id)).toMatchObject({
      planVersion: 1,
      state: 'rendering',
    });
  });

  it('removes the episode, its plans and its ledger rows for a notes-only week, with no call', async () => {
    const { episode } = await weekWith(['note', 'note']);
    await bindings.DB.prepare(
      `INSERT INTO episode_plans (episode_id, version, plan, created_by, created_at) VALUES (?, 1, '{}', 'recap', ?)`,
    )
      .bind(episode.id, T)
      .run();
    await costLedger.upsert(ctx().db, {
      episodeId: episode.id,
      step: 'transcribe',
      provider: 'workersAi',
      unit: 'audioSecond',
      units: 3,
      microUsd: 26,
      at: T,
    });
    expect(await planStep(ctx(), episode.id)).toEqual({ outcome: 'empty' });
    expect(fixtures.planner.calls).toEqual([]);
    expect(await episodes.get(ctx().db, episode.id)).toBeNull();
    expect(await count('episode_plans', episode.id)).toBe(0);
    expect(await count('cost_ledger', episode.id)).toBe(0);
  });
});

describe('migration 0006', () => {
  it('adds episode_plans, unique by episode and version, going with its episode', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0006_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0006_'));
    expect(next).toHaveLength(1);
    await applyD1Migrations(MIGRATION_DB, before);
    const T0 = '2027-03-21T18:00:00.000Z';
    const userId = crypto.randomUUID();
    const documentaryId = crypto.randomUUID();
    await MIGRATION_DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES (?, '', ?, 1)",
    )
      .bind(userId, `${userId}@example.com`)
      .run();
    await MIGRATION_DB.prepare(
      `INSERT INTO documentaries (id, owner_user_id, title, kind, time_zone, episode_day, episode_hour, created_at, updated_at)
       VALUES (?, ?, 'Kept', 'solo', 'Europe/Berlin', 0, 18, ?, ?)`,
    )
      .bind(documentaryId, userId, T0, T0)
      .run();
    const episodeId = crypto.randomUUID();
    await MIGRATION_DB.prepare(
      `INSERT INTO episodes (id, documentary_id, number, week_start, week_end, state, plan_version, render_version, cost_cents, updated_at)
       VALUES (?, ?, 1, '2027-03-15', '2027-03-21', 'planning', 0, 0, 0, ?)`,
    )
      .bind(episodeId, documentaryId, T0)
      .run();

    await applyD1Migrations(MIGRATION_DB, next);
    const kept = await MIGRATION_DB.prepare('SELECT state FROM episodes WHERE id = ?')
      .bind(episodeId)
      .first<{ state: string }>();
    expect(kept?.state).toBe('planning');
    const insertPlan = (version: number) =>
      MIGRATION_DB.prepare(
        `INSERT INTO episode_plans (episode_id, version, plan, created_by, created_at) VALUES (?, ?, '{}', 'model', ?)`,
      )
        .bind(episodeId, version, T0)
        .run();
    await insertPlan(1);
    await insertPlan(2);
    await expect(insertPlan(1)).rejects.toThrow();
    await MIGRATION_DB.prepare('DELETE FROM episodes WHERE id = ?').bind(episodeId).run();
    const left = await MIGRATION_DB.prepare(
      'SELECT COUNT(*) AS n FROM episode_plans WHERE episode_id = ?',
    )
      .bind(episodeId)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
