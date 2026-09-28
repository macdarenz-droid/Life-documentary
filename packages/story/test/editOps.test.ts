import type { EpisodePlanV1 } from '@life/contracts';
import { PlannerOutput, Uuid, WeekBriefV1, type EditChange } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyEdit,
  assemblePlan,
  cutOf,
  narratorShare,
  planDurationMs,
  planLengthMs,
  recapPlan,
  weekBrief,
} from '../src';
import { NAMES, fixtureWeeks } from '../src/fixtures/weeks';

const id = (n: number) => Uuid.parse(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const CAST = id(90);
const [A1, A2, A3, A4, C1, C2, P1, P2, N1, GONE] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id) as [
  Uuid,
  Uuid,
  Uuid,
  Uuid,
  Uuid,
  Uuid,
  Uuid,
  Uuid,
  Uuid,
  Uuid,
];

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

const MOMENTS = [
  moment(A1, 'answer', { durationMs: 8000 }),
  moment(A2, 'answer', { durationMs: 6000 }),
  moment(A3, 'answer', { durationMs: 5000, castIds: [CAST] }),
  moment(A4, 'answer', { durationMs: 4000 }),
  moment(C1, 'clip', { durationMs: 10_000 }),
  moment(C2, 'clip', { durationMs: 4000 }),
  moment(P1, 'photo', { castIds: [CAST] }),
  moment(P2, 'photo'),
  moment(N1, 'note', { text: 'Rain all day.' }),
];

function briefOf(moments: Moment[]): WeekBriefV1 {
  return WeekBriefV1.parse({
    version: 1,
    documentaryId: id(100),
    episodeNumber: 4,
    weekStart: '2027-03-01',
    weekEnd: '2027-03-07',
    timeZone: 'Europe/London',
    moments,
    storylines: [],
    cast: [{ id: CAST, name: 'Maya' }],
    previousSummaries: [],
    questionsAsked: [],
  });
}

const brief = briefOf(MOMENTS);

const output = PlannerOutput.parse({
  title: 'Bread from the harbour',
  coldOpen: { momentId: A3 },
  scenes: [
    {
      heading: 'Tuesday',
      shots: [{ momentId: A2 }, { momentId: C1 }],
      narratorBridge: { text: 'Tuesday was quiet.' },
    },
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

const plan = assemblePlan(output, brief, { narratorVoiceId: 'narrator-1' });
// Cold open 5,000 + title 3,000 + 6,000 + 6,000 + 3,000 + 4,000 + 8,000 + closing 2,500.
const LENGTH = 37_500;

const apply = (change: EditChange, on: EpisodePlanV1 = plan, b: WeekBriefV1 = brief) =>
  applyEdit(on, change, b);
const applied = (change: EditChange, on: EpisodePlanV1 = plan, b: WeekBriefV1 = brief) => {
  const result = applyEdit(on, change, b);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.plan;
};
const withScene = (index: number, patch: Partial<EpisodePlanV1['scenes'][number]>) => ({
  ...plan,
  scenes: plan.scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)),
});

const fixture = (name: string) => {
  const week = fixtureWeeks().find((w) => w.name === name)!;
  const b = weekBrief(week.input);
  return { brief: b, plan: recapPlan(b)! };
};

describe('applyEdit: rename', () => {
  it('renames, trimmed, and a second identical rename is unchanged', () => {
    const next = applied({ kind: 'retitle', title: '  Rain on the tram ' });
    expect(next).toEqual({ ...plan, title: 'Rain on the tram', targetDurationMs: LENGTH });
    expect(apply({ kind: 'retitle', title: 'Rain on the tram' }, next)).toEqual({
      ok: false,
      reason: 'unchanged',
    });
  });
});

describe('applyEdit: swap a line for an answer', () => {
  const swap = (sceneIndex: number, momentId: Uuid): EditChange => ({
    kind: 'swapLine',
    sceneIndex,
    with: { kind: 'moment', momentId },
  });

  it('removes the line and puts the answer first; the same swap again is noLine', () => {
    const next = applied(swap(0, A4));
    expect(next.scenes[0]!.narratorBridge).toBeUndefined();
    expect(next.scenes[0]!.shots.map((s) => s.momentId)).toEqual([A4, A2, C1]);
    expect(next.targetDurationMs).toBe(LENGTH + 4000);
    expect(apply(swap(0, A4), next)).toEqual({ ok: false, reason: 'noLine' });
  });

  it('uses the given in and out inside the answer', () => {
    const next = applied({
      kind: 'swapLine',
      sceneIndex: 0,
      with: { kind: 'moment', momentId: A4, inMs: 1000, outMs: 3000 },
    });
    expect(next.scenes[0]!.shots[0]).toEqual({ momentId: A4, inMs: 1000, outMs: 3000 });
  });

  it('refuses a scene without a line, a clip, an answer already in, a missing answer and a full scene', () => {
    expect(apply(swap(2, A4))).toEqual({ ok: false, reason: 'noLine' });
    expect(apply(swap(0, C2))).toEqual({ ok: false, reason: 'notAnAnswer' });
    expect(apply(swap(0, A3))).toEqual({ ok: false, reason: 'alreadyIn' });
    expect(apply(swap(0, A1))).toEqual({ ok: false, reason: 'alreadyIn' });
    // A localOnly answer never reaches the brief.
    expect(apply(swap(0, GONE))).toEqual({ ok: false, reason: 'notAnAnswer' });
    expect(apply(swap(7, A4))).toEqual({ ok: false, reason: 'noScene' });
    const full = withScene(0, {
      shots: [P2, P2, P2, P2, P2, P2].map((m) => ({ momentId: m })),
    });
    expect(apply(swap(0, A4), full)).toEqual({ ok: false, reason: 'sceneFull' });
  });
});

describe('applyEdit: own words', () => {
  const own = (sceneIndex: number, text: string): EditChange => ({
    kind: 'swapLine',
    sceneIndex,
    with: { kind: 'bridge', text },
  });

  it('refuses a digit, and any line on a recap', () => {
    expect(apply(own(0, 'We saw 3 boats.'))).toEqual({ ok: false, reason: 'hasNumbers' });
    const single = fixture(NAMES.single);
    expect(apply(own(0, 'A quiet week.'), single.plan, single.brief)).toEqual({
      ok: false,
      reason: 'noNarrator',
    });
  });

  it('refuses a long line on a short episode, and applies a shorter one over the quarter', () => {
    const long =
      'We sat by the window and watched the rain run down the glass while the kettle sang and the cat slept on';
    expect(apply(own(0, long))).toEqual({ ok: false, reason: 'narratorTooLong' });

    const over = withScene(0, { narratorBridge: { text: long } });
    expect(narratorShare(over, brief).share).toBeGreaterThan(0.25);
    expect(applied(own(0, 'Tuesday.'), over).scenes[0]!.narratorBridge).toEqual({
      text: 'Tuesday.',
    });
  });

  it('adds a line to a scene without one, and the same line again is unchanged', () => {
    const next = applied(own(2, ' Home, at last. '));
    expect(next.scenes[2]!.narratorBridge).toEqual({ text: 'Home, at last.' });
    expect(apply(own(2, 'Home, at last.'), next)).toEqual({ ok: false, reason: 'unchanged' });
  });
});

describe('applyEdit: take out a clip', () => {
  const drop = (sceneIndex: number, shotIndex: number): EditChange => ({
    kind: 'dropClip',
    sceneIndex,
    shotIndex,
  });

  it("takes a scene's only shot with the scene and its line, and moves the closing and lower thirds", () => {
    const once = applied(drop(1, 0));
    expect(once.scenes[1]!.shots.map((s) => s.momentId)).toEqual([C2]);
    // P1 was the closing and has left the cut: the closing is the last remaining shot.
    expect(once.closing).toEqual({ momentId: A1 });
    expect(once.lowerThirds).toEqual([]);

    const twice = applied(drop(1, 0), once);
    expect(twice.scenes.map((s) => s.heading)).toEqual(['Tuesday', 'Home again']);
    expect(twice.scenes.some((s) => s.narratorBridge?.text === 'Saturday, at the allotment.')).toBe(
      false,
    );
    expect(twice.targetDurationMs).toBe(LENGTH - 7000);
  });

  it('keeps a closing that was never in the cut', () => {
    const outside = { ...plan, closing: { momentId: P2 } };
    expect(applied(drop(1, 0), outside).closing).toEqual({ momentId: P2 });
  });

  it('refuses the last shot, a missing index and falling under 20 s', () => {
    const one = { ...plan, scenes: [{ ...plan.scenes[0]!, shots: [{ momentId: A2 }] }] };
    expect(apply(drop(0, 0), one)).toEqual({ ok: false, reason: 'lastShot' });
    expect(apply(drop(0, 5))).toEqual({ ok: false, reason: 'noShot' });
    expect(apply(drop(9, 0))).toEqual({ ok: false, reason: 'noScene' });

    const a = applied(drop(2, 0)); // A1: 29,500
    const b = applied(drop(0, 0), a); // A2: 23,500
    expect(b.targetDurationMs).toBe(23_500);
    expect(apply(drop(0, 0), b)).toEqual({ ok: false, reason: 'tooShort' }); // C1: 17,500
  });

  it('takes out an answer from a model plan with the narrator at exactly the quarter', () => {
    const quarter = {
      ...plan,
      coldOpen: { ...plan.coldOpen, outMs: 4000 },
      scenes: plan.scenes.map((s, i) =>
        i === 1
          ? {
              ...s,
              narratorBridge: {
                text: 'Saturday at the allotment with Maya and the dog and some tea',
              },
            }
          : s,
      ),
    };
    expect(narratorShare(quarter, brief).share).toBe(0.25);
    expect(apply(drop(0, 0), quarter).ok).toBe(true);
  });

  it("on the photos-only recap, takes out the closing photo's scene and moves the closing", () => {
    const photos = fixture(NAMES.photos);
    const lastScene = photos.plan.scenes.length - 1;
    const last = photos.plan.scenes[lastScene]!;
    expect(last.shots).toHaveLength(1);
    expect(photos.plan.closing.momentId).toBe(last.shots[0]!.momentId);

    const next = applied(drop(lastScene, 0), photos.plan, photos.brief);
    expect(next.scenes).toHaveLength(lastScene);
    expect(next.closing.momentId).toBe(next.scenes.at(-1)!.shots.at(-1)!.momentId);
  });
});

describe('applyEdit: last shot and music', () => {
  it('picks a moment the cut shows, and refuses one outside it', () => {
    expect(applied({ kind: 'closingShot', momentId: C1 }).closing).toEqual({ momentId: C1 });
    expect(applied({ kind: 'closingShot', momentId: A3 }).closing).toEqual({ momentId: A3 });
    expect(apply({ kind: 'closingShot', momentId: P2 })).toEqual({
      ok: false,
      reason: 'notInCut',
    });
    expect(apply({ kind: 'closingShot', momentId: P1 })).toEqual({
      ok: false,
      reason: 'unchanged',
    });
  });

  it('changes the mood and clears the track; the same mood again is unchanged', () => {
    const tracked = { ...plan, music: { mood: 'warm' as const, trackId: 'track-7' } };
    const next = applied({ kind: 'musicMood', mood: 'calm' }, tracked);
    expect(next.music).toEqual({ mood: 'calm' });
    expect(apply({ kind: 'musicMood', mood: 'calm' }, next)).toEqual({
      ok: false,
      reason: 'unchanged',
    });
  });
});

describe('applyEdit: recaps and gone moments', () => {
  it('renames the single answer recap, at 20 s', () => {
    const single = fixture(NAMES.single);
    const next = applied({ kind: 'retitle', title: 'One answer' }, single.plan, single.brief);
    expect(next.title).toBe('One answer');
    expect(next.targetDurationMs).toBe(20_000);
  });

  it("refuses the photos-only recap's own mood as unchanged", () => {
    const photos = fixture(NAMES.photos);
    expect(
      apply({ kind: 'musicMood', mood: photos.plan.music.mood }, photos.plan, photos.brief),
    ).toEqual({ ok: false, reason: 'unchanged' });
  });

  it('renames a plan whose answer has left the brief', () => {
    const without = briefOf(MOMENTS.filter((m) => m.momentId !== A1));
    const next = applied({ kind: 'retitle', title: 'Still here' }, plan, without);
    expect(next.targetDurationMs).toBe(LENGTH - 8000);
  });
});

describe('planLengthMs', () => {
  it('matches planDurationMs for an assembled plan, and a gone moment counts 0', () => {
    expect(planLengthMs(plan, brief)).toBe(planDurationMs(output, brief));
    expect(planLengthMs(plan, brief)).toBe(LENGTH);
    expect(planLengthMs(plan, briefOf(MOMENTS.filter((m) => m.momentId !== C2)))).toBe(
      LENGTH - 4000,
    );
  });
});

describe('cutOf', () => {
  it('gives the lines, kinds, closing and mood; a gone moment has no kind', () => {
    const cut = cutOf(plan, briefOf(MOMENTS.filter((m) => m.momentId !== C2)));
    expect(cut).toEqual({
      title: 'Bread from the harbour',
      narrated: true,
      coldOpen: { momentId: A3 },
      scenes: [
        {
          heading: 'Tuesday',
          line: 'Tuesday was quiet.',
          shots: [
            { momentId: A2, kind: 'answer' },
            { momentId: C1, kind: 'clip' },
          ],
        },
        {
          heading: 'At the allotment',
          line: 'Saturday, at the allotment.',
          shots: [{ momentId: P1, kind: 'photo' }, { momentId: C2 }],
        },
        { heading: 'Home again', shots: [{ momentId: A1, kind: 'answer' }] },
      ],
      closing: { momentId: P1 },
      mood: 'warm',
    });
    expect(cutOf(fixture(NAMES.single).plan, fixture(NAMES.single).brief).narrated).toBe(false);
  });
});
