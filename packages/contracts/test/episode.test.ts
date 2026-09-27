import { describe, expect, it } from 'vitest';
import { Derived, EditOp, EpisodePlanV1, WeekBriefV1 } from '../src';

const id = (n: number) => `3b241101-e2bb-4255-8caf-4136c566${String(n).padStart(4, '0')}`;
const NOW = '2027-03-15T09:30:00Z';

const scene = (n: number) => ({
  heading: `Scene ${n}`,
  storylineId: id(90),
  shots: [
    { momentId: id(n * 10 + 1), inMs: 0, outMs: 4000 },
    { momentId: id(n * 10 + 2), kenBurns: { fromScale: 1, toScale: 1.2 } },
  ],
  narratorBridge: { text: 'Then the week turned.' },
  captionsFromTranscript: true,
});

const plan = {
  version: 1,
  title: 'The week the job began',
  episodeNumber: 3,
  weekStart: '2027-03-08',
  weekEnd: '2027-03-14',
  coldOpen: { momentId: id(11), inMs: 500, outMs: 3500 },
  scenes: [scene(1), scene(2), scene(3)],
  closing: { momentId: id(32) },
  tease: { storylineId: id(90), text: 'Next week: the first review.' },
  music: { mood: 'warm' },
  lowerThirds: [{ momentId: id(12), castId: id(80), atMs: 2000 }],
  targetDurationMs: 90_000,
  summary: 'A first week at the new job, a long run and a quiet Sunday.',
};

const ok = (value: unknown) => EpisodePlanV1.safeParse(value).success;

describe('EpisodePlanV1', () => {
  it('accepts a valid plan with 3 scenes', () => {
    expect(ok(plan)).toBe(true);
  });
  it('rejects 0 and 6 scenes', () => {
    expect(ok({ ...plan, scenes: [] })).toBe(false);
    expect(ok({ ...plan, scenes: [1, 2, 3, 4, 5, 6].map(scene) })).toBe(false);
  });
  it('rejects a scene with 0 or 7 shots', () => {
    const shots = (n: number) => Array.from({ length: n }, (_, i) => ({ momentId: id(100 + i) }));
    expect(ok({ ...plan, scenes: [{ ...scene(1), shots: shots(0) }] })).toBe(false);
    expect(ok({ ...plan, scenes: [{ ...scene(1), shots: shots(7) }] })).toBe(false);
    expect(ok({ ...plan, scenes: [{ ...scene(1), shots: shots(6) }] })).toBe(true);
  });
  it('rejects a cold open that does not end after it starts', () => {
    expect(ok({ ...plan, coldOpen: { momentId: id(11), inMs: 3500, outMs: 3500 } })).toBe(false);
  });
  it('rejects a shot whose outMs is not after its inMs', () => {
    const bad = { ...scene(1), shots: [{ momentId: id(11), inMs: 4000, outMs: 1000 }] };
    expect(ok({ ...plan, scenes: [bad] })).toBe(false);
  });
  it('rejects a 141-character bridge', () => {
    const bad = { ...scene(1), narratorBridge: { text: 'a'.repeat(141) } };
    expect(ok({ ...plan, scenes: [bad] })).toBe(false);
  });
  it('rejects targetDurationMs 19,999', () => {
    expect(ok({ ...plan, targetDurationMs: 19_999 })).toBe(false);
  });
  it('rejects a weekEnd that is not weekStart + 6', () => {
    expect(ok({ ...plan, weekEnd: '2027-03-15' })).toBe(false);
  });
});

describe('WeekBriefV1', () => {
  const moment = (n: number) => ({
    momentId: id(n),
    day: '2027-03-09',
    weekday: 'Tuesday',
    kind: 'answer',
    durationMs: 8000,
    questionText: 'What happened next with The new job?',
    transcript: 'We met the team.',
    mood: 'bright',
    storylineIds: [id(90)],
    castIds: [],
  });
  const brief = {
    version: 1,
    documentaryId: id(1),
    episodeNumber: 3,
    weekStart: '2027-03-08',
    weekEnd: '2027-03-14',
    timeZone: 'Europe/Berlin',
    moments: [moment(10), moment(11)],
    storylines: [{ id: id(90), title: 'The new job', open: true }],
    cast: [{ id: id(80), name: 'Maya', relation: 'sister' }],
    previousSummaries: ['Week two: moving boxes.'],
    questionsAsked: [
      { day: '2027-03-09', text: 'What happened next with The new job?', answered: true },
    ],
  };

  it('accepts a valid brief', () => {
    expect(WeekBriefV1.safeParse(brief).success).toBe(true);
  });
  it('rejects a brief with 301 moments', () => {
    const moments = Array.from({ length: 301 }, (_, i) => moment(1000 + i));
    expect(WeekBriefV1.safeParse({ ...brief, moments }).success).toBe(false);
  });
});

describe('Derived', () => {
  const derived = {
    id: id(11),
    momentId: id(10),
    transcript: 'We met the team.',
    language: 'en',
    provider: 'workersAi',
    modelVersion: 'whisper-1',
    producedAt: NOW,
  };
  it('accepts a transcript only', () => {
    expect(Derived.safeParse(derived).success).toBe(true);
  });
  it('rejects a row without transcript and caption', () => {
    expect(Derived.safeParse({ ...derived, transcript: undefined }).success).toBe(false);
  });
});

describe('EditOp', () => {
  const edit = (op: unknown) => ({
    id: id(70),
    episodeId: id(71),
    seq: 1,
    appliedToVersion: 1,
    op,
  });
  const ops = [
    { kind: 'retitle', title: 'A better title' },
    {
      kind: 'swapLine',
      sceneIndex: 0,
      with: { kind: 'moment', momentId: id(12), inMs: 0, outMs: 3000 },
    },
    { kind: 'swapLine', sceneIndex: 1, with: { kind: 'bridge', text: 'And then it rained.' } },
    { kind: 'dropClip', sceneIndex: 1, shotIndex: 0 },
    { kind: 'closingShot', momentId: id(13) },
    { kind: 'musicMood', mood: 'bittersweet' },
  ];

  it.each(ops)('parses $kind', (op) => {
    expect(EditOp.safeParse(edit(op)).success).toBe(true);
  });
  it('rejects an unknown kind', () => {
    expect(EditOp.safeParse(edit({ kind: 'reorder', sceneIndex: 0 })).success).toBe(false);
  });
});
