// A short episode over the generated fixture media in packages/render/public/fixtures, placed by
// `episodeTimeline` like a real one. It covers every segment kind the renderer draws.
import { EpisodePlanV1, type RenderManifestV2, type TimedWord } from '@life/contracts';
import {
  episodeTimeline,
  type EpisodeTimelineInput,
  type TimelineMoment,
  type TimelineNarration,
} from './episodeTimeline';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const COLD = id(1);
const ANSWER = id(2);
const PHOTO = id(3);
const CLIP = id(4);
const VOICE = id(5);
const MAYA = id(90);
const STORY = id(80);

const ANSWER_MS = 4000;
const CLIP_MS = 3000;
const NARRATION_MS = 1500;

const words = (text: string, fromMs: number, stepMs: number): TimedWord[] =>
  text.split(' ').map((w, i) => ({
    text: w,
    fromMs: fromMs + i * stepMs,
    toMs: fromMs + i * stepMs + stepMs - 50,
  }));

const moments: TimelineMoment[] = [
  {
    momentId: COLD,
    kind: 'answer',
    media: { type: 'video', src: 'fixtures/answer.mp4', durationMs: ANSWER_MS },
    words: { words: words('We ran for the tram in the rain', 300, 400), approximate: false },
  },
  {
    momentId: ANSWER,
    kind: 'answer',
    media: { type: 'video', src: 'fixtures/answer.mp4', durationMs: ANSWER_MS },
    words: { words: words('Maya made soup for everyone', 300, 600), approximate: false },
  },
  { momentId: PHOTO, kind: 'photo', media: { type: 'photo', src: 'fixtures/photo.jpg' } },
  {
    momentId: CLIP,
    kind: 'clip',
    media: { type: 'video', src: 'fixtures/clip.mp4', durationMs: CLIP_MS },
  },
  {
    momentId: VOICE,
    kind: 'answer',
    media: { type: 'voice', src: 'fixtures/answer-voice.wav', durationMs: ANSWER_MS },
    question: 'What was the best part of your week?',
    words: { words: words('Sitting by the window with tea', 300, 550), approximate: true },
  },
];

const plan = EpisodePlanV1.parse({
  version: 1,
  title: 'The week it rained',
  episodeNumber: 1,
  weekStart: '2026-10-12',
  weekEnd: '2026-10-18',
  coldOpen: { momentId: COLD, inMs: 0, outMs: ANSWER_MS },
  scenes: [
    {
      heading: 'Tuesday',
      shots: [{ momentId: ANSWER }, { momentId: PHOTO, kenBurns: { fromScale: 1, toScale: 1.06 } }],
      narratorBridge: { text: 'On Tuesday, Maya came over.' },
      captionsFromTranscript: true,
    },
    {
      heading: 'The weekend',
      shots: [{ momentId: CLIP, inMs: 0, outMs: CLIP_MS }, { momentId: VOICE }],
      captionsFromTranscript: true,
    },
  ],
  closing: { momentId: PHOTO },
  tease: { storylineId: STORY, text: 'Next week, the coast.' },
  music: { mood: 'calm' },
  lowerThirds: [{ momentId: ANSWER, castId: MAYA, atMs: 0 }],
  targetDurationMs: 30_000,
  summary: 'It rained all week, and Maya came over.',
});

const narration: TimelineNarration[] = [
  {
    kind: 'bridge',
    sceneIndex: 0,
    src: 'fixtures/voice.wav',
    durationMs: NARRATION_MS,
    words: words('On Tuesday, Maya came over.', 0, 300),
  },
  {
    kind: 'tease',
    src: 'fixtures/voice.wav',
    durationMs: NARRATION_MS,
    words: words('Next week, the coast.', 0, 375),
  },
];

/** The fixture episode in 9:16 (`portrait`, the default) or as a 16:9 export (`landscape`). */
export function fixtureManifest(
  format: EpisodeTimelineInput['format'] = 'portrait',
): RenderManifestV2 {
  const manifest = episodeTimeline({
    plan,
    format,
    moments,
    cast: [{ id: MAYA, name: 'Maya', relation: 'sister' }],
    storylines: [{ id: STORY, title: 'The coast' }],
    episodeNumber: plan.episodeNumber,
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd,
    narration,
    music: { src: 'fixtures/music.wav' },
  });
  if (!manifest) throw new Error('The fixture episode has no shots.');
  return manifest;
}
