import { PlannerOutput, Uuid, WeekBriefV1, type EpisodePlanV1 } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import {
  answerWords,
  assemblePlan,
  fitNarration,
  lineWords,
  narrationLines,
  narratorShare,
  speakable,
  type Alignment,
} from '../src';

const id = (n: number) => Uuid.parse(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const [A1, A2, C1, P1, S1] = [1, 2, 3, 4, 5].map(id) as [Uuid, Uuid, Uuid, Uuid, Uuid];

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
  episodeNumber: 2,
  weekStart: '2027-03-01',
  weekEnd: '2027-03-07',
  timeZone: 'Europe/London',
  moments: [
    moment(A1, 'answer', { durationMs: 10_000 }),
    moment(A2, 'answer', { durationMs: 8000 }),
    moment(C1, 'clip', { durationMs: 9000 }),
    moment(P1, 'photo'),
  ],
  storylines: [{ id: S1, title: 'The new job', open: true }],
  cast: [],
  previousSummaries: [],
  questionsAsked: [],
});

const output = PlannerOutput.parse({
  title: 'The first week at the new job',
  coldOpen: { momentId: A1 },
  scenes: [
    {
      heading: 'Monday',
      shots: [{ momentId: A2 }],
      narratorBridge: { text: 'Monday, the new job.' },
    },
    { heading: 'Out', shots: [{ momentId: C1 }], narratorBridge: { text: 'Later, by the water.' } },
    { heading: 'Home', shots: [{ momentId: P1 }], narratorBridge: { text: 'Home again.' } },
  ],
  closing: { momentId: P1 },
  tease: { storylineId: S1, text: 'Next week, the second week.' },
  musicMood: 'warm',
  lowerThirds: [],
  summary: 'They started the new job.',
});

const plan: EpisodePlanV1 = assemblePlan(output, brief, { narratorVoiceId: 'narrator-1' });

describe('narrationLines', () => {
  it('gives the bridges in scene order, then the tease, indexed from 0', () => {
    expect(narrationLines(plan)).toEqual([
      { index: 0, kind: 'bridge', sceneIndex: 0, text: 'Monday, the new job.' },
      { index: 1, kind: 'bridge', sceneIndex: 1, text: 'Later, by the water.' },
      { index: 2, kind: 'bridge', sceneIndex: 2, text: 'Home again.' },
      { index: 3, kind: 'tease', text: 'Next week, the second week.' },
    ]);
  });
  it('gives none for a plan without narration', () => {
    const quiet: EpisodePlanV1 = {
      ...plan,
      scenes: plan.scenes.map((s) => ({
        heading: s.heading,
        shots: s.shots,
        captionsFromTranscript: s.captionsFromTranscript,
      })),
    };
    delete quiet.tease;
    expect(narrationLines(quiet)).toEqual([]);
  });
});

describe('speakable', () => {
  it('refuses a digit and an empty line, and passes numbers in words', () => {
    expect(speakable('Week 12')).toBe(false);
    expect(speakable('   ')).toBe(false);
    expect(speakable('Twelve weeks in')).toBe(true);
  });
});

/** An alignment of `text` with each character 100 ms long, from `startSeconds`. */
function alignmentOf(text: string, startSeconds = 0): Alignment {
  const characters = [...text];
  return {
    characters,
    startSeconds: characters.map((_, i) => startSeconds + i * 0.1),
    endSeconds: characters.map((_, i) => startSeconds + (i + 1) * 0.1),
  };
}

describe('lineWords', () => {
  it("gives each word from its first character's start to its last character's end", () => {
    expect(lineWords('Home again.', alignmentOf('Home again.', 0.25))).toEqual([
      { text: 'Home', fromMs: 250, toMs: 650 },
      { text: 'again.', fromMs: 750, toMs: 1350 },
    ]);
  });
  it('gives null for a missing, empty, uneven or mismatched alignment', () => {
    expect(lineWords('Home again.', null)).toBeNull();
    expect(
      lineWords('Home again.', { characters: [], startSeconds: [], endSeconds: [] }),
    ).toBeNull();
    const uneven = alignmentOf('Home again.');
    expect(
      lineWords('Home again.', { ...uneven, endSeconds: uneven.endSeconds.slice(1) }),
    ).toBeNull();
    expect(lineWords('Home again.', alignmentOf('Home, again.'))).toBeNull();
  });
});

describe('answerWords', () => {
  it('uses the segments’ word timings, exactly', () => {
    const result = answerWords(
      {
        transcript: 'Rain again. Then sun.',
        segments: [
          {
            startMs: 0,
            endMs: 1500,
            text: 'Rain again.',
            words: [
              { text: 'Rain', startMs: 100, endMs: 500 },
              { text: 'again.', startMs: 600, endMs: 1400 },
            ],
          },
          {
            startMs: 2000,
            endMs: 3000,
            text: 'Then sun.',
            words: [
              { text: 'Then', startMs: 2000, endMs: 2400 },
              { text: 'sun.', startMs: 2500, endMs: 3200 },
            ],
          },
        ],
      },
      3000,
    );
    expect(result).toEqual({
      approximate: false,
      words: [
        { text: 'Rain', fromMs: 100, toMs: 500 },
        { text: 'again.', fromMs: 600, toMs: 1400 },
        { text: 'Then', fromMs: 2000, toMs: 2400 },
        { text: 'sun.', fromMs: 2500, toMs: 3000 },
      ],
    });
  });
  it('spreads each segment’s words over that segment when there are no word timings', () => {
    const result = answerWords(
      {
        transcript: 'Rain again. Then sun.',
        segments: [
          { startMs: 0, endMs: 1000, text: 'Rain again.' },
          { startMs: 2000, endMs: 4000, text: 'Then sun.' },
        ],
      },
      5000,
    );
    expect(result).toEqual({
      approximate: true,
      words: [
        { text: 'Rain', fromMs: 0, toMs: 500 },
        { text: 'again.', fromMs: 500, toMs: 1000 },
        { text: 'Then', fromMs: 2000, toMs: 3000 },
        { text: 'sun.', fromMs: 3000, toMs: 4000 },
      ],
    });
  });
  it('spreads the transcript over the answer when there are no segments', () => {
    const result = answerWords({ transcript: 'One two three four' }, 8000);
    expect(result.approximate).toBe(true);
    expect(result.words.map((w) => w.text)).toEqual(['One', 'two', 'three', 'four']);
    expect(result.words[0]?.fromMs).toBe(0);
    expect(result.words.at(-1)?.toMs).toBe(8000);
  });
  it('gives no words without a transcript', () => {
    expect(answerWords(undefined, 8000)).toEqual({ words: [], approximate: false });
    expect(answerWords({ transcript: ' ' }, 8000)).toEqual({ words: [], approximate: false });
  });
});

describe('fitNarration', () => {
  const lines = narrationLines(plan);
  const person = narratorShare(plan, brief).spokenMs - narratorShare(plan, brief).narratorMs;
  const clips = (ms: number[]) => new Map(ms.map((m, i) => [i, m]));

  it('keeps everything under the cap', () => {
    // The person speaks for 18 s (the cold open 10 s and the answer shot 8 s); 6 of 24 s is a quarter.
    expect(person).toBe(18_000);
    expect(fitNarration(lines, clips([1500, 1500, 1000, 2000]), plan, brief)).toEqual([0, 1, 2, 3]);
  });
  it('drops the tease first, then the last scene’s bridge', () => {
    // 8.5 s of 26.5 s is over a quarter; without the tease 5.5 of 23.5 is not.
    expect(fitNarration(lines, clips([2000, 2000, 1500, 3000]), plan, brief)).toEqual([0, 1, 2]);
    // Without the tease 7.5 of 25.5 s is still over; without the last bridge 5.5 of 23.5 is not.
    expect(fitNarration(lines, clips([3000, 2500, 2000, 1000]), plan, brief)).toEqual([0, 1]);
  });
  it('leaves out a line without a clip', () => {
    expect(
      fitNarration(
        lines,
        new Map([
          [0, 1000],
          [3, 1000],
        ]),
        plan,
        brief,
      ),
    ).toEqual([0, 3]);
  });
  it('keeps nothing when the person never speaks', () => {
    const silent = WeekBriefV1.parse({
      ...brief,
      moments: brief.moments.map((m) => (m.kind === 'answer' ? { ...m, durationMs: 0 } : m)),
    });
    const silentPlan = { ...plan, coldOpen: { ...plan.coldOpen, outMs: 0 } };
    expect(
      narratorShare(silentPlan, silent).spokenMs - narratorShare(silentPlan, silent).narratorMs,
    ).toBe(0);
    expect(fitNarration(lines, clips([1000, 1000, 1000, 1000]), silentPlan, silent)).toEqual([]);
  });
});
