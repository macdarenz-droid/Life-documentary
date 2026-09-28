import { z } from 'zod';
import { TimedWord } from '../episode/narration';

/** A slow zoom on a still photo; shared by the render manifest and the episode plan. */
export const KenBurns = z.object({
  fromScale: z.number().min(1).max(1.5),
  toScale: z.number().min(1).max(1.5),
});
export type KenBurns = z.infer<typeof KenBurns>;

const Ms = z.number().int().min(0);
const Src = z.string().min(1);

const PhotoMedia = z.object({ type: z.literal('photo'), src: Src, kenBurns: KenBurns.optional() });

/** What a cold open or a shot shows and plays. */
const SegmentMedia = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('video'),
    src: Src,
    inMs: Ms,
    sound: z.enum(['full', 'natural', 'none']),
  }),
  z.object({
    type: z.literal('voice'),
    src: Src,
    inMs: Ms,
    question: z.string().min(1).max(200).optional(),
  }),
  PhotoMedia,
]);

/** A muted picture behind a card. */
const Background = z.discriminatedUnion('type', [
  PhotoMedia,
  z.object({ type: z.literal('video'), src: Src, inMs: Ms }),
]);

const Span = { fromMs: Ms, toMs: z.number().int().min(1) };
const ends = <T extends { fromMs: number; toMs: number }>(v: T) => v.toMs > v.fromMs;
const endsAfter = { path: ['toMs'], message: 'It ends after it starts' };

const Segment = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('coldOpen'), ...Span, media: SegmentMedia }),
    z.object({
      kind: z.literal('title'),
      ...Span,
      label: z.string().min(1).max(40),
      text: z.string().min(1).max(60),
      subtitle: z.string().min(1).max(80).optional(),
    }),
    z.object({
      kind: z.literal('sceneOpen'),
      ...Span,
      heading: z.string().min(1).max(60),
      background: Background.optional(),
    }),
    z.object({ kind: z.literal('shot'), ...Span, media: SegmentMedia }),
    z.object({
      kind: z.literal('closing'),
      ...Span,
      text: z.string().min(1).max(80),
      credit: z.literal('AI-narrated'),
      background: Background.optional(),
    }),
    z.object({
      kind: z.literal('tease'),
      ...Span,
      label: z.string().min(1).max(40),
      storyline: z.string().min(1).max(60).optional(),
    }),
  ])
  .refine(ends, endsAfter);

const SpeechUnit = z
  .object({
    kind: z.enum(['person', 'narrator']),
    ...Span,
    captions: z.boolean(),
    approximate: z.boolean(),
    words: z.array(TimedWord).max(200),
  })
  .refine(ends, endsAfter);

/**
 * The episode as the renderer draws it (P15, D41): segments back to back from 0, the narrator's clips,
 * every speech unit with its words in episode time, scene labels, lower thirds and the music.
 */
export const RenderManifestV2 = z.object({
  version: z.literal(2),
  format: z.union([
    z.object({ width: z.literal(1080), height: z.literal(1920) }),
    z.object({ width: z.literal(1920), height: z.literal(1080) }),
  ]),
  fps: z.literal(30),
  durationMs: z.number().int().min(1).max(600_000),
  segments: z.array(Segment).min(1).max(40),
  narration: z
    .array(z.object({ src: Src, atMs: Ms, durationMs: z.number().int().min(200) }))
    .max(6),
  speech: z.array(SpeechUnit).max(40),
  sceneLabels: z
    .array(
      z.object({
        atMs: Ms,
        durationMs: z.number().int().min(1),
        text: z.string().min(1).max(60),
      }),
    )
    .max(5),
  lowerThirds: z
    .array(
      z.object({
        atMs: Ms,
        durationMs: z.number().int().min(1000).max(6000),
        name: z.string().min(1).max(40),
        relation: z.string().min(1).max(40).optional(),
      }),
    )
    .max(20),
  music: z
    .object({ src: Src, gain: z.number().min(0).max(1), duckTo: z.number().min(0).max(1) })
    .optional(),
});
export type RenderManifestV2 = z.infer<typeof RenderManifestV2>;
export type RenderManifestV2Input = z.input<typeof RenderManifestV2>;
