import { describe, expect, it } from 'vitest';
import { PlannerOutput, StoredPlan, WeekBriefV1 } from '../src';

const id = (n: number) => `3b241101-e2bb-4255-8caf-4136c566${String(n).padStart(4, '0')}`;

const scene = (n: number) => ({
  heading: `Scene ${n}`,
  shots: [{ momentId: id(n * 10 + 1) }, { momentId: id(n * 10 + 2) }],
});

const output = {
  title: 'The week the kitchen flooded',
  coldOpen: { momentId: id(11) },
  scenes: [scene(1), scene(2), scene(3)],
  closing: { momentId: id(32) },
  musicMood: 'warm',
  lowerThirds: [{ momentId: id(12), castId: id(80) }],
  summary: 'The kitchen flooded on Tuesday and the plumber came on Friday.',
};

const ok = (value: unknown) => PlannerOutput.safeParse(value).success;

describe('PlannerOutput', () => {
  it('accepts a valid output with 3 scenes', () => {
    expect(ok(output)).toBe(true);
  });
  it('refuses 2 and 6 scenes', () => {
    expect(ok({ ...output, scenes: [scene(1), scene(2)] })).toBe(false);
    expect(ok({ ...output, scenes: [1, 2, 3, 4, 5, 6].map(scene) })).toBe(false);
    expect(ok({ ...output, scenes: [1, 2, 3, 4, 5].map(scene) })).toBe(true);
  });
  it('refuses 7 shots in a scene', () => {
    const shots = Array.from({ length: 7 }, (_, i) => ({ momentId: id(100 + i) }));
    expect(ok({ ...output, scenes: [{ ...scene(1), shots }, scene(2), scene(3)] })).toBe(false);
    expect(
      ok({ ...output, scenes: [{ ...scene(1), shots: shots.slice(0, 6) }, scene(2), scene(3)] }),
    ).toBe(true);
  });
  it('refuses a 141-character bridge', () => {
    const bridged = (n: number) => ({
      ...scene(1),
      narratorBridge: { text: 'a'.repeat(n) },
    });
    expect(ok({ ...output, scenes: [bridged(141), scene(2), scene(3)] })).toBe(false);
    expect(ok({ ...output, scenes: [bridged(140), scene(2), scene(3)] })).toBe(true);
  });
  it('refuses a 401-character summary', () => {
    expect(ok({ ...output, summary: 'a'.repeat(401) })).toBe(false);
    expect(ok({ ...output, summary: 'a'.repeat(400) })).toBe(true);
  });
  it('refuses an unknown music mood', () => {
    expect(ok({ ...output, musicMood: 'epic' })).toBe(false);
  });
});

describe('StoredPlan', () => {
  const plan = {
    version: 1,
    title: 'The week the kitchen flooded',
    episodeNumber: 3,
    weekStart: '2027-03-08',
    weekEnd: '2027-03-14',
    coldOpen: { momentId: id(11), inMs: 0, outMs: 3500 },
    scenes: [{ heading: 'Tuesday', shots: [{ momentId: id(12) }], captionsFromTranscript: true }],
    closing: { momentId: id(32) },
    music: { mood: 'warm' },
    lowerThirds: [],
    targetDurationMs: 30_000,
    summary: 'The kitchen flooded.',
  };
  const stored = {
    episodeId: id(1),
    version: 1,
    plan,
    createdBy: 'model',
    createdAt: '2027-03-15T09:30:00Z',
  };
  it('accepts a stored plan', () => {
    expect(StoredPlan.safeParse(stored).success).toBe(true);
  });
  it('refuses version 0 and an unknown maker', () => {
    expect(StoredPlan.safeParse({ ...stored, version: 0 }).success).toBe(false);
    expect(StoredPlan.safeParse({ ...stored, createdBy: 'person' }).success).toBe(false);
  });
});

describe('WeekBriefV1 moments', () => {
  it('refuses a moment without a weekday', () => {
    const moment = {
      momentId: id(10),
      day: '2027-03-09',
      kind: 'answer',
      storylineIds: [],
      castIds: [],
    };
    const brief = {
      version: 1,
      documentaryId: id(1),
      episodeNumber: 3,
      weekStart: '2027-03-08',
      weekEnd: '2027-03-14',
      timeZone: 'Europe/Berlin',
      moments: [moment],
      storylines: [],
      cast: [],
      previousSummaries: [],
      questionsAsked: [],
    };
    expect(WeekBriefV1.safeParse(brief).success).toBe(false);
    expect(
      WeekBriefV1.safeParse({ ...brief, moments: [{ ...moment, weekday: 'Tuesday' }] }).success,
    ).toBe(true);
  });
});
