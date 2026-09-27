import { PlannerOutput, Uuid, WeekBriefV1, type EpisodePlanV1 } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import {
  assemblePlan,
  narratorShare,
  planCopyErrors,
  planDurationMs,
  planEligibility,
  planMomentErrors,
  planProperties,
  planVoiceErrors,
  recapWords,
  validatePlan,
  weekBrief,
} from '../src';
import { NAMES, fixtureWeeks } from '../src/fixtures/weeks';

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

const brief = briefOf([
  moment(A1, 'answer', { durationMs: 8000, transcript: TRANSCRIPT }),
  moment(A2, 'answer'),
  moment(A3, 'answer', { durationMs: 5000, castIds: [CAST] }),
  moment(C1, 'clip', { durationMs: 10_000 }),
  moment(C2, 'clip', { durationMs: 4000 }),
  moment(P1, 'photo', { castIds: [CAST] }),
  moment(N1, 'note', { text: 'Rain all day.' }),
]);

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
  lowerThirds: [
    { momentId: P1, castId: CAST },
    { momentId: A3, castId: CAST },
  ],
  summary: 'They went to the harbour and the allotment.',
});

const VOICE = { narratorVoiceId: 'narrator-1' };
const plan = assemblePlan(output, brief, VOICE);

function withoutBridges(o: PlannerOutput): PlannerOutput {
  return {
    ...o,
    scenes: o.scenes.map((s) => ({
      heading: s.heading,
      shots: s.shots,
    })),
  };
}

describe('assemblePlan', () => {
  it('sets the week, the number and the version from the brief', () => {
    expect(plan).toMatchObject({
      version: 1,
      episodeNumber: 4,
      weekStart: '2027-03-01',
      weekEnd: '2027-03-07',
      title: 'Bread from the harbour',
      music: { mood: 'warm' },
    });
  });
  it('plays the cold open and answers whole, clips up to 6 s and photos 3 s with Ken Burns', () => {
    expect(plan.coldOpen).toEqual({ momentId: A3, inMs: 0, outMs: 5000 });
    expect(plan.scenes.map((s) => s.shots)).toEqual([
      [{ momentId: A2 }, { momentId: C1, inMs: 0, outMs: 6000 }],
      [
        { momentId: P1, kenBurns: { fromScale: 1, toScale: 1.06 } },
        { momentId: C2, inMs: 0, outMs: 4000 },
      ],
      [{ momentId: A1 }],
    ]);
  });
  it('sets captionsFromTranscript on every scene', () => {
    expect(plan.scenes.every((s) => s.captionsFromTranscript)).toBe(true);
  });
  it("times a lower third 500 ms into its moment's first shot and drops one without a shot", () => {
    // Cold open 5,000 + title 3,000 + A2 6,000 + C1 6,000: P1 starts at 20,000.
    expect(plan.lowerThirds).toEqual([{ momentId: P1, castId: CAST, atMs: 20_500 }]);
  });
  it('sets narratorVoiceId only with a bridge or a tease', () => {
    expect(plan.narratorVoiceId).toBe('narrator-1');
    expect(assemblePlan(withoutBridges(output), brief, VOICE).narratorVoiceId).toBeUndefined();
  });
  it('sets targetDurationMs to planDurationMs', () => {
    // 5,000 + 3,000 + 6,000 + 6,000 + 3,000 + 4,000 + 8,000 + 2,500.
    expect(planDurationMs(output, brief)).toBe(37_500);
    expect(plan.targetDurationMs).toBe(37_500);
  });
  it('passes validatePlan in model mode', () => {
    expect(validatePlan(plan, brief, 'model')).toEqual({ ok: true });
  });
});

describe('planMomentErrors', () => {
  it('finds nothing when every moment is a picture or sound of the week', () => {
    expect(planMomentErrors(output, brief)).toEqual([]);
  });
  it('names a note and an unknown id by where they are, with no other text', () => {
    const bad = {
      ...output,
      coldOpen: { momentId: N1 },
      closing: { momentId: id(999) },
    };
    expect(planMomentErrors(bad, brief)).toEqual([
      'cold open: not a picture or sound from this week',
      'closing: not a picture or sound from this week',
    ]);
  });
});

describe('planEligibility', () => {
  it('gives model, recap and empty', () => {
    expect(planEligibility(brief)).toBe('model');
    const short = briefOf([
      moment(A1, 'answer', { durationMs: 3000 }),
      moment(P1, 'photo'),
      moment(id(8), 'photo'),
    ]);
    // 3,000 + 3,000 + (3,000 + 3,000 + 3,000) + 2,500 = 17,500.
    expect(planEligibility(short)).toBe('recap');
    expect(planEligibility(briefOf([moment(N1, 'note', { text: 'Rain.' })]))).toBe('empty');
  });
  it('gives recap for photos only and clips only, empty for a quiet week and notes only', () => {
    const of = (name: string) => {
      const week = fixtureWeeks().find((w) => w.name === name);
      if (!week) throw new Error(`no week ${name}`);
      return planEligibility(weekBrief(week.input));
    };
    expect(of(NAMES.photos)).toBe('recap');
    expect(of('clips only')).toBe('recap');
    expect(of(NAMES.quiet)).toBe('empty');
    expect(of('notes only')).toBe('empty');
  });
});

describe('planVoiceErrors', () => {
  it('finds a banned phrase, "!", "—" and ";" in a heading', () => {
    const noisy: EpisodePlanV1 = {
      ...plan,
      scenes: plan.scenes.map((s, i) =>
        i === 0 ? { ...s, heading: 'A journey — home; now!' } : s,
      ),
    };
    expect(planVoiceErrors(noisy)).toEqual([
      'scene 0 heading uses "journey"',
      'scene 0 heading uses "!"',
      'scene 0 heading uses "—"',
      'scene 0 heading uses ";"',
    ]);
  });
  it('finds nothing in a clean plan', () => {
    expect(planVoiceErrors(plan)).toEqual([]);
  });
});

function withBridge(text: string, scene = 1): EpisodePlanV1 {
  return {
    ...plan,
    scenes: plan.scenes.map((s, i) => (i === scene ? { ...s, narratorBridge: { text } } : s)),
  };
}

describe('planCopyErrors', () => {
  it('flags a bridge with five words in a row from a transcript', () => {
    expect(planCopyErrors(withBridge('Monday. We walked down to the harbour.'), brief)).toEqual([
      "scene 1 bridge repeats the person's words",
    ]);
  });
  it('does not flag four words in a row', () => {
    expect(planCopyErrors(withBridge('Monday, we walked down to.'), brief)).toEqual([]);
  });
});

describe('narratorShare', () => {
  it('gives the narrator time, the spoken time and the share', () => {
    // 4 words: 1,600 ms. Spoken: 1,600 + cold open 5,000 + A2 6,000 + A1 8,000.
    expect(narratorShare(plan, brief)).toEqual({
      narratorMs: 1600,
      spokenMs: 20_600,
      share: 1600 / 20_600,
    });
  });
});

describe('planProperties', () => {
  const clean = planProperties(plan, brief);
  it('scores the assembled plan as clean', () => {
    expect(clean).toEqual({
      valid: true,
      userVoiceShare: 1 - 1600 / 20_600,
      coldOpenIsAnswer: true,
      momentsFromBrief: true,
      titleNotGeneric: true,
      noCopiedWords: true,
      voiceClean: true,
    });
  });
  it('flags a generic title on its own', () => {
    expect(planProperties({ ...plan, title: 'My week' }, brief)).toEqual({
      ...clean,
      titleNotGeneric: false,
    });
  });
  it('flags a copied bridge on its own', () => {
    const copied = withBridge('We walked down to the harbour.');
    const { noCopiedWords, userVoiceShare, ...rest } = planProperties(copied, brief);
    expect(noCopiedWords).toBe(false);
    expect(userVoiceShare).toBeGreaterThan(0.75);
    expect(rest).toEqual({
      valid: true,
      coldOpenIsAnswer: true,
      momentsFromBrief: true,
      titleNotGeneric: true,
      voiceClean: true,
    });
  });
  it('flags a cold open on a photo as coldOpenIsAnswer and valid both false', () => {
    const onPhoto = assemblePlan({ ...output, coldOpen: { momentId: P1 } }, brief, VOICE);
    const p = planProperties(onPhoto, brief);
    expect(p.coldOpenIsAnswer).toBe(false);
    expect(p.valid).toBe(false);
  });
  it('flags a narrator share over 25% as userVoiceShare below 0.75 and valid false', () => {
    const long = 'Then it rained on the way home and the bus was late again so they walked';
    const loud: EpisodePlanV1 = {
      ...plan,
      scenes: plan.scenes.map((s) => ({ ...s, narratorBridge: { text: long } })),
    };
    const p = planProperties(loud, brief);
    expect(p.userVoiceShare).toBeLessThan(0.75);
    expect(p.valid).toBe(false);
  });
  it.each(['My week', '  HIGHLIGHTS ', 'Week 12', 'episode 3', 'A week in review'])(
    '"%s" is generic',
    (title) => {
      expect(planProperties({ ...plan, title }, brief).titleNotGeneric).toBe(false);
    },
  );
  it("the recap's own title is generic", () => {
    const title = recapWords.title(brief.weekStart);
    expect(planProperties({ ...plan, title }, brief).titleNotGeneric).toBe(false);
  });
  it('"The week the kitchen flooded" is not generic', () => {
    const title = 'The week the kitchen flooded';
    expect(planProperties({ ...plan, title }, brief).titleNotGeneric).toBe(true);
  });
});
