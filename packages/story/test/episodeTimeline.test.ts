import { EpisodePlanV1, type RenderManifestV2, type TimedWord } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import {
  episodeTimeline,
  episodeWords,
  manifestErrors,
  musicVolumeAt,
  manifestDurationMs,
  type EpisodeTimelineInput,
  type TimelineMoment,
  type TimelineNarration,
} from '../src';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [COLD, A1, P1, C1, A2, CAST, STORY] = [1, 2, 3, 4, 5, 90, 80].map(id) as [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/** `n` words, the first at `fromMs`, one every `stepMs`, each `lengthMs` long. */
const wordsFrom = (n: number, fromMs: number, stepMs: number, lengthMs: number): TimedWord[] =>
  Array.from({ length: n }, (_, i) => ({
    text: `w${i}`,
    fromMs: fromMs + i * stepMs,
    toMs: fromMs + i * stepMs + lengthMs,
  }));

const moments: TimelineMoment[] = [
  {
    momentId: COLD,
    kind: 'answer',
    media: { type: 'video', src: 'cold.mp4', durationMs: 12_000 },
    words: { words: wordsFrom(5, 1000, 500, 500), approximate: false },
  },
  {
    momentId: A1,
    kind: 'answer',
    media: { type: 'voice', src: 'a1.m4a', durationMs: 8000 },
    question: 'What made you laugh today?',
    words: { words: wordsFrom(6, 2000, 1000, 800), approximate: false },
  },
  { momentId: P1, kind: 'photo', media: { type: 'photo', src: 'p1.jpg' } },
  { momentId: C1, kind: 'clip', media: { type: 'video', src: 'c1.mp4', durationMs: 5000 } },
  {
    momentId: A2,
    kind: 'answer',
    media: { type: 'video', src: 'a2.mp4', durationMs: 9000 },
    words: { words: wordsFrom(8, 500, 1000, 700), approximate: true },
  },
];

const plan = EpisodePlanV1.parse({
  version: 1,
  title: 'Rain on the tram',
  episodeNumber: 12,
  weekStart: '2026-10-12',
  weekEnd: '2026-10-18',
  coldOpen: { momentId: COLD, inMs: 0, outMs: 6000 },
  scenes: [
    {
      heading: 'Tuesday',
      shots: [{ momentId: A1 }, { momentId: P1 }],
      narratorBridge: { text: 'Tuesday, at home.' },
      captionsFromTranscript: true,
    },
    {
      heading: 'Out',
      shots: [{ momentId: C1, inMs: 0, outMs: 4000 }],
      captionsFromTranscript: true,
    },
    {
      heading: 'Home again',
      shots: [{ momentId: A2 }],
      narratorBridge: { text: 'Back home again.' },
      captionsFromTranscript: false,
    },
  ],
  closing: { momentId: P1 },
  tease: { storylineId: STORY, text: 'Next week, the coast.' },
  music: { mood: 'calm' },
  lowerThirds: [
    { momentId: A1, castId: CAST, atMs: 0 },
    { momentId: A2, castId: CAST, atMs: 0 },
  ],
  narratorVoiceId: 'narrator-1',
  targetDurationMs: 60_000,
  summary: 'They rode the tram.',
});

const narration: TimelineNarration[] = [
  {
    kind: 'bridge',
    sceneIndex: 0,
    src: 'n0.mp3',
    durationMs: 1500,
    words: wordsFrom(3, 0, 500, 400),
  },
  {
    kind: 'bridge',
    sceneIndex: 2,
    src: 'n2.mp3',
    durationMs: 1200,
    words: wordsFrom(3, 0, 400, 300),
  },
  { kind: 'tease', src: 'nt.mp3', durationMs: 1000, words: wordsFrom(4, 0, 250, 200) },
];

const base: EpisodeTimelineInput = {
  plan,
  format: 'portrait',
  moments,
  cast: [{ id: CAST, name: 'Maya', relation: 'Sister' }],
  storylines: [{ id: STORY, title: 'The move' }],
  episodeNumber: 12,
  weekStart: '2026-10-12',
  weekEnd: '2026-10-18',
  narration,
};

const timeline = (change: Partial<EpisodeTimelineInput> = {}) => {
  const m = episodeTimeline({ ...base, ...change });
  if (!m) throw new Error('no manifest');
  return m;
};
const without = (...ids: string[]) => moments.filter((m) => !ids.includes(m.momentId));
const spans = (m: RenderManifestV2) => m.segments.map((s) => [s.kind, s.fromMs, s.toMs]);

describe('episodeTimeline', () => {
  it('places the cold open, title, scenes with their slots, closing and tease in order', () => {
    const m = timeline();
    expect(spans(m)).toEqual([
      ['coldOpen', 0, 3300],
      ['title', 3300, 6300],
      ['sceneOpen', 6300, 8800],
      ['shot', 8800, 15_100],
      ['shot', 15_100, 18_100],
      ['shot', 18_100, 22_100],
      ['sceneOpen', 22_100, 24_300],
      ['shot', 24_300, 33_300],
      ['closing', 33_300, 35_800],
      ['tease', 35_800, 37_800],
    ]);
    expect(m.durationMs).toBe(37_800);
    expect(manifestDurationMs(m)).toBe(37_800);
    expect(m.format).toEqual({ width: 1080, height: 1920 });
    expect(m.segments[1]).toMatchObject({
      label: 'Episode 12',
      text: 'Rain on the tram',
      subtitle: '12 to 18 October',
    });
    expect(m.segments[2]).toMatchObject({
      heading: 'Tuesday',
      background: { type: 'photo', src: 'p1.jpg' },
    });
    expect(m.segments[3]).toMatchObject({
      media: { type: 'voice', src: 'a1.m4a', inMs: 1700, question: 'What made you laugh today?' },
    });
    expect(m.segments[5]).toMatchObject({
      media: { type: 'video', src: 'c1.mp4', inMs: 0, sound: 'natural' },
    });
    expect(m.segments[8]).toMatchObject({
      text: 'See you next week.',
      credit: 'AI-narrated',
      background: { type: 'photo', src: 'p1.jpg' },
    });
    expect(m.segments[9]).toMatchObject({ label: 'Next week', storyline: 'The move' });
    expect(m.narration).toEqual([
      { src: 'n0.mp3', atMs: 6700, durationMs: 1500 },
      { src: 'n2.mp3', atMs: 22_500, durationMs: 1200 },
      { src: 'nt.mp3', atMs: 36_200, durationMs: 1000 },
    ]);
    expect(m.sceneLabels).toEqual([{ atMs: 18_100, durationMs: 2000, text: 'Out' }]);
    expect(m.lowerThirds).toEqual([
      { atMs: 9300, durationMs: 3000, name: 'Maya', relation: 'Sister' },
      { atMs: 24_800, durationMs: 3000, name: 'Maya', relation: 'Sister' },
    ]);
    expect(m.music).toBeUndefined();
    expect(manifestErrors(m)).toEqual([]);
  });

  it('trims an answer with exact words to 300 ms before and 500 ms after them, not approximate ones', () => {
    const m = timeline();
    expect(m.segments[0]).toMatchObject({ media: { type: 'video', inMs: 700, sound: 'full' } });
    expect(m.segments[0]!.toMs - m.segments[0]!.fromMs).toBe(3300);
    expect(m.segments[7]).toMatchObject({ media: { type: 'video', src: 'a2.mp4', inMs: 0 } });
    expect(m.segments[7]!.toMs - m.segments[7]!.fromMs).toBe(9000);
  });

  it('carries each answer and clip of speech with its words in episode time', () => {
    const m = timeline();
    expect(m.speech.map((u) => [u.kind, u.fromMs, u.toMs, u.captions, u.approximate])).toEqual([
      ['person', 0, 3300, true, false],
      ['narrator', 6700, 8200, true, false],
      ['person', 8800, 15_100, true, false],
      ['narrator', 22_500, 23_700, true, false],
      ['person', 24_300, 33_300, false, true],
      ['narrator', 36_200, 37_200, true, false],
    ]);
    expect(m.speech[0]!.words[0]).toEqual({ text: 'w0', fromMs: 300, toMs: 800 });
    expect(m.speech[1]!.words[0]).toEqual({ text: 'w0', fromMs: 6700, toMs: 7100 });
  });

  it('keeps the first 200 words of a unit', () => {
    const many = moments.map((m) =>
      m.momentId === A2
        ? { ...m, words: { words: wordsFrom(250, 0, 36, 30), approximate: true } }
        : m,
    );
    const m = timeline({ moments: many });
    expect(m.speech.find((u) => u.fromMs === 24_300)?.words).toHaveLength(200);
  });

  it('drops the tease and then the last bridge when trims leave the narrator over a quarter', () => {
    const long = {
      momentId: A1,
      kind: 'answer' as const,
      media: { type: 'voice' as const, src: 'a1.m4a', durationMs: 20_000 },
      words: { words: wordsFrom(5, 2000, 1000, 1000), approximate: false },
    };
    const photo = moments.find((m) => m.momentId === P1)!;
    const small = EpisodePlanV1.parse({
      ...plan,
      coldOpen: { momentId: P1, inMs: 0, outMs: 3000 },
      scenes: [
        { ...plan.scenes[0], shots: [{ momentId: A1 }] },
        { ...plan.scenes[2], shots: [{ momentId: P1 }] },
      ],
      lowerThirds: [],
    });
    const clips: TimelineNarration[] = [
      { kind: 'bridge', sceneIndex: 0, src: 'n0.mp3', durationMs: 1000, words: [] },
      { kind: 'bridge', sceneIndex: 1, src: 'n1.mp3', durationMs: 1000, words: [] },
      { kind: 'tease', src: 'nt.mp3', durationMs: 800, words: [] },
    ];
    // Untrimmed the answer is 20 s and 2.8 s of narration fits; trimmed to 4.8 s it does not.
    const m = timeline({ plan: small, moments: [long, photo], narration: clips });
    expect(m.segments.map((s) => s.kind)).toEqual([
      'coldOpen',
      'title',
      'sceneOpen',
      'shot',
      'shot',
      'closing',
    ]);
    expect(m.narration.map((n) => n.src)).toEqual(['n0.mp3']);
    expect(manifestErrors(m)).toEqual([]);
  });

  it('drops a shot whose moment is missing', () => {
    const m = timeline({ moments: without(C1) });
    expect(m.segments.some((s) => s.kind === 'shot' && s.media.src === 'c1.mp4')).toBe(false);
    expect(m.sceneLabels).toEqual([]);
  });

  it('drops a scene with no shots left together with its bridge', () => {
    const m = timeline({ moments: without(A2) });
    expect(m.segments.filter((s) => s.kind === 'sceneOpen')).toHaveLength(1);
    expect(m.narration.map((n) => n.src)).toEqual(['n0.mp3', 'nt.mp3']);
    expect(m.lowerThirds).toHaveLength(1);
  });

  it('drops a 300 ms clip', () => {
    const short = EpisodePlanV1.parse({
      ...plan,
      scenes: plan.scenes.map((s, i) =>
        i === 1 ? { ...s, shots: [{ momentId: C1, inMs: 0, outMs: 300 }] } : s,
      ),
    });
    const m = timeline({ plan: short });
    expect(m.segments.some((s) => s.kind === 'shot' && s.media.src === 'c1.mp4')).toBe(false);
  });

  it('has no cold open when its moment is missing', () => {
    expect(timeline({ moments: without(COLD) }).segments[0]?.kind).toBe('title');
  });

  it('still ends in a closing with the credit and no background when the closing moment is missing', () => {
    const m = timeline({ moments: without(P1) });
    const closing = m.segments.find((s) => s.kind === 'closing');
    expect(closing).toMatchObject({ credit: 'AI-narrated' });
    expect(closing && 'background' in closing).toBe(false);
  });

  it('has no storyline line on a tease whose storyline is unknown', () => {
    const tease = timeline({ storylines: [] }).segments.at(-1);
    expect(tease).toMatchObject({ kind: 'tease', label: 'Next week' });
    expect(tease && 'storyline' in tease).toBe(false);
  });

  it('gives nothing to render without media', () => {
    expect(episodeTimeline({ ...base, moments: [] })).toBeNull();
  });

  it('drops a lower third whose cast id is unknown', () => {
    expect(timeline({ cast: [] }).lowerThirds).toEqual([]);
  });

  it('carries the 16:9 size and the music', () => {
    const m = timeline({ format: 'landscape', music: { src: 'calm.mp3' } });
    expect(m.format).toEqual({ width: 1920, height: 1080 });
    expect(m.music).toEqual({ src: 'calm.mp3', gain: 0.6, duckTo: 0.15 });
  });
});

describe('manifestErrors', () => {
  const good = timeline();

  it('flags narration speech overlapping a person unit', () => {
    const m = {
      ...good,
      speech: [...good.speech, { ...good.speech[0]!, kind: 'narrator' as const, words: [] }],
    };
    expect(manifestErrors(m).some((e) => e.includes('overlaps speech'))).toBe(true);
  });

  it('flags a gap between segments', () => {
    const segments = good.segments.map((s, i) => (i === 1 ? { ...s, fromMs: s.fromMs + 100 } : s));
    expect(manifestErrors({ ...good, segments })).toContain(
      'segment 1 starts at 3400 ms, not 3300 ms',
    );
  });

  it('flags a missing closing', () => {
    const segments = good.segments.filter((s) => s.kind !== 'closing');
    expect(manifestErrors({ ...good, segments })).toContain('there are 0 closings, not one');
  });

  it('flags a narrator over a quarter of all speech', () => {
    const speech = good.speech.map((u) =>
      u.kind === 'person' ? { ...u, toMs: u.fromMs + 500, words: [] } : u,
    );
    expect(manifestErrors({ ...good, speech })).toContain(
      'the narrator speaks more than a quarter of the time',
    );
  });
});

describe('musicVolumeAt for v2', () => {
  const m = timeline({ music: { src: 'calm.mp3' } });

  it('ducks under an answer and a bridge, plays at gain between speech, and is 0 at the ends', () => {
    expect(musicVolumeAt(12_000, m)).toBeCloseTo(0.15, 10);
    expect(musicVolumeAt(7450, m)).toBeCloseTo(0.15, 10);
    expect(musicVolumeAt(4800, m)).toBeCloseTo(0.6, 10);
    expect(musicVolumeAt(0, m)).toBe(0);
    expect(musicVolumeAt(m.durationMs, m)).toBe(0);
  });

  it('is 0 without music', () => {
    expect(musicVolumeAt(4800, timeline())).toBe(0);
  });
});

describe('episodeWords', () => {
  it('writes the dates within a month and across two', () => {
    expect(episodeWords.dates('2026-10-12', '2026-10-18')).toBe('12 to 18 October');
    expect(episodeWords.dates('2026-09-29', '2026-10-05')).toBe('29 September to 5 October');
    expect(episodeWords.label(12)).toBe('Episode 12');
  });
});
