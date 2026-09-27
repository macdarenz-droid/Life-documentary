import { Uuid, type EpisodePlanV1, type WeekBriefV1 } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import { recapPlan, validatePlan, weekBrief } from '../src';
import { NAMES, fixtureWeeks } from '../src/fixtures/weeks';

const fullWeek = fixtureWeeks().find((w) => w.name === NAMES.full);
if (!fullWeek) throw new Error('no full week');
const brief = weekBrief(fullWeek.input);
const of = (kind: string) => brief.moments.filter((m) => m.kind === kind);
const [a0, a1, a2, a3, , , a6] = of('answer');
const [clip0] = of('clip');
const [photo0] = of('photo');
if (!a0 || !a1 || !a2 || !a3 || !a6 || !clip0 || !photo0)
  throw new Error('full week is missing media');
const UNKNOWN = Uuid.parse('00000000-0000-4000-8000-0000000fffff');

const plan: EpisodePlanV1 = {
  version: 1,
  title: 'A week by the water',
  episodeNumber: brief.episodeNumber,
  weekStart: brief.weekStart,
  weekEnd: brief.weekEnd,
  coldOpen: { momentId: a0.momentId, inMs: 0, outMs: 3000 },
  scenes: [
    {
      heading: 'Arriving',
      shots: [{ momentId: a1.momentId }, { momentId: clip0.momentId }],
      captionsFromTranscript: true,
    },
    {
      heading: 'The middle',
      shots: [{ momentId: a2.momentId }, { momentId: photo0.momentId }],
      narratorBridge: { text: 'Then the week turned.' },
      captionsFromTranscript: true,
    },
    { heading: 'Home again', shots: [{ momentId: a3.momentId }], captionsFromTranscript: false },
  ],
  closing: { momentId: a6.momentId },
  music: { mood: 'warm' },
  lowerThirds: [],
  narratorVoiceId: 'voice-1',
  targetDurationMs: 90_000,
  summary: 'A week of walks by the water.',
};

function scene(
  i: number,
  patch: Partial<EpisodePlanV1['scenes'][number]>,
): EpisodePlanV1['scenes'] {
  return plan.scenes.map((s, k) => (k === i ? { ...s, ...patch } : s));
}

function withoutNarratorVoice(): EpisodePlanV1 {
  const copy: EpisodePlanV1 = { ...plan };
  delete copy.narratorVoiceId;
  return copy;
}

function errorsOf(
  p: EpisodePlanV1,
  b: WeekBriefV1 = brief,
  mode: 'model' | 'recap' = 'model',
): string[] {
  const result = validatePlan(p, b, mode);
  return result.ok ? [] : result.errors;
}

describe('validatePlan in model mode', () => {
  it('passes the hand-written plan for the full week', () => {
    expect(validatePlan(plan, brief, 'model')).toEqual({ ok: true });
  });

  it('flags a moment that is not in the brief', () => {
    const scenes = scene(0, { shots: [{ momentId: UNKNOWN }, { momentId: clip0.momentId }] });
    expect(errorsOf({ ...plan, scenes })).toEqual([
      `scene 0 shot 0: moment ${UNKNOWN} is not in the brief`,
    ]);
  });

  it('flags a weekStart, weekEnd or episode number that differs from the brief', () => {
    expect(errorsOf({ ...plan, weekStart: '2027-02-28' })).toEqual([
      `weekStart 2027-02-28 is not the brief's ${brief.weekStart}`,
    ]);
    expect(errorsOf({ ...plan, weekEnd: '2027-03-08' })).toEqual([
      `weekEnd 2027-03-08 is not the brief's ${brief.weekEnd}`,
    ]);
    expect(errorsOf({ ...plan, episodeNumber: 9 })).toEqual([
      `episodeNumber 9 is not the brief's ${brief.episodeNumber}`,
    ]);
  });

  it('flags a scene storyline that is not in the brief', () => {
    expect(errorsOf({ ...plan, scenes: scene(2, { storylineId: UNKNOWN }) })).toEqual([
      `scene 2: storyline ${UNKNOWN} is not in the brief`,
    ]);
  });

  it('flags a tease storyline that is not in the brief', () => {
    expect(errorsOf({ ...plan, tease: { storylineId: UNKNOWN, text: 'Next week.' } })).toEqual([
      `tease: storyline ${UNKNOWN} is not in the brief`,
    ]);
  });

  it('flags a lower third whose cast member is not in the brief', () => {
    const lowerThirds = [{ momentId: a1.momentId, castId: UNKNOWN, atMs: 0 }];
    expect(errorsOf({ ...plan, lowerThirds })).toEqual([
      `lower third 0: cast member ${UNKNOWN} is not in the brief`,
    ]);
  });

  it('flags a lower third whose cast member is not in that moment', () => {
    const withCast = { ...brief, cast: [{ id: UNKNOWN, name: 'Maya' }] };
    const lowerThirds = [{ momentId: a1.momentId, castId: UNKNOWN, atMs: 0 }];
    expect(errorsOf({ ...plan, lowerThirds }, withCast)).toEqual([
      `lower third 0: cast member ${UNKNOWN} is not in moment ${a1.momentId}`,
    ]);
  });

  it('flags an outMs beyond the moment duration', () => {
    const scenes = scene(0, {
      shots: [{ momentId: a1.momentId, outMs: 99_000 }, { momentId: clip0.momentId }],
    });
    expect(errorsOf({ ...plan, scenes })).toEqual([
      `scene 0 shot 0: outMs 99000 is beyond the moment's ${a1.durationMs} ms`,
    ]);
  });

  it('flags fewer than 3 scenes', () => {
    expect(errorsOf({ ...plan, scenes: plan.scenes.slice(0, 2) })).toEqual([
      'a model plan needs at least 3 scenes, not 2',
    ]);
  });

  it('flags a target duration outside 30,000–240,000 ms', () => {
    expect(errorsOf({ ...plan, targetDurationMs: 29_900 })).toEqual([
      'targetDurationMs 29900 is outside 30000–240000',
    ]);
    expect(errorsOf({ ...plan, targetDurationMs: 30_000 })).toEqual([]);
  });

  it('flags a cold open that is not an answer', () => {
    expect(
      errorsOf({ ...plan, coldOpen: { momentId: clip0.momentId, inMs: 0, outMs: 3000 } }),
    ).toEqual(['cold open: a clip is not an answer']);
  });

  it('flags a narrator bridge without a narrator voice', () => {
    const withoutVoice = withoutNarratorVoice();
    expect(errorsOf(withoutVoice)).toEqual(['scene 1: a narrator bridge needs narratorVoiceId']);
  });

  it('flags a tease without a narrator voice', () => {
    const withoutVoice = withoutNarratorVoice();
    const withStory = { ...brief, storylines: [{ id: UNKNOWN, title: 'The new job', open: true }] };
    const p = {
      ...withoutVoice,
      scenes: scene(1, { narratorBridge: undefined }),
      tease: { storylineId: UNKNOWN, text: 'Next week.' },
    };
    expect(errorsOf(p, withStory)).toEqual(['tease: a tease needs narratorVoiceId']);
  });

  it('flags narrator time above 25% of spoken time', () => {
    const text = Array.from({ length: 25 }, () => 'so').join(' ');
    const result = errorsOf({ ...plan, scenes: scene(1, { narratorBridge: { text } }) });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^narrator time 10000 ms is above 25% of spoken time \d+ ms$/);
  });
});

describe('the 25% rule', () => {
  // Cold open 3,600 ms and no answer shots: 3 words (1,200 ms) is exactly 25% of 4,800 ms.
  const quietPlan = (words: number): EpisodePlanV1 => ({
    ...plan,
    coldOpen: { momentId: a0.momentId, inMs: 0, outMs: 3600 },
    scenes: [
      { heading: 'One', shots: [{ momentId: clip0.momentId }], captionsFromTranscript: true },
      {
        heading: 'Two',
        shots: [{ momentId: photo0.momentId }],
        narratorBridge: { text: Array.from({ length: words }, () => 'still').join(' ') },
        captionsFromTranscript: true,
      },
      { heading: 'Three', shots: [{ momentId: clip0.momentId }], captionsFromTranscript: true },
    ],
  });

  it('passes at exactly 25%', () => {
    expect(validatePlan(quietPlan(3), brief, 'model')).toEqual({ ok: true });
  });
  it('fails with one word more', () => {
    expect(errorsOf(quietPlan(4))).toEqual([
      'narrator time 1600 ms is above 25% of spoken time 5200 ms',
    ]);
  });
});

describe('validatePlan in recap mode', () => {
  const recap = recapPlan(brief);
  if (!recap) throw new Error('the full week has a recap');

  it('passes the recap', () => {
    expect(validatePlan(recap, brief, 'recap')).toEqual({ ok: true });
  });
  it('flags a narrator bridge', () => {
    const scenes = recap.scenes.map((s, i) =>
      i === 0 ? { ...s, narratorBridge: { text: 'Then.' } } : s,
    );
    expect(errorsOf({ ...recap, scenes }, brief, 'recap')).toEqual([
      'scene 0: a recap has no narrator bridge',
    ]);
  });
  it('flags a tease', () => {
    const withStory = { ...brief, storylines: [{ id: UNKNOWN, title: 'The new job', open: true }] };
    expect(
      errorsOf(
        { ...recap, tease: { storylineId: UNKNOWN, text: 'Next week.' } },
        withStory,
        'recap',
      ),
    ).toEqual(['tease: a recap has no tease']);
  });
  it('flags a narrator voice', () => {
    expect(errorsOf({ ...recap, narratorVoiceId: 'voice-1' }, brief, 'recap')).toEqual([
      'a recap has no narratorVoiceId',
    ]);
  });
});
