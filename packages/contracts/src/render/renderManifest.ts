import { z } from 'zod';

/** A slow zoom on a still photo; shared by the render manifest and the episode plan. */
export const KenBurns = z.object({
  fromScale: z.number().min(1).max(1.5),
  toScale: z.number().min(1).max(1.5),
});
export type KenBurns = z.infer<typeof KenBurns>;

const VideoShot = z.object({
  kind: z.literal('video'),
  src: z.string().min(1),
  durationMs: z.number().int().min(500).max(15000),
  inMs: z.number().int().min(0).default(0),
});

const PhotoShot = z.object({
  kind: z.literal('photo'),
  src: z.string().min(1),
  durationMs: z.number().int().min(500).max(10000),
  kenBurns: KenBurns.optional(),
});

/**
 * The render input (API ↔ render). `src` values are URLs or paths relative to the render
 * project's `public/` folder.
 */
export const RenderManifestV1 = z.object({
  version: z.literal(1),
  format: z.object({ width: z.literal(1080), height: z.literal(1920), fps: z.literal(30) }),
  title: z.object({
    text: z.string().min(1).max(80),
    subtitle: z.string().min(1).max(80).optional(),
    durationMs: z.number().int().min(1000).max(6000),
  }),
  shots: z
    .array(z.discriminatedUnion('kind', [VideoShot, PhotoShot]))
    .min(1)
    .max(40),
  narration: z
    .array(
      z.object({
        src: z.string().min(1),
        atMs: z.number().int().min(0),
        durationMs: z.number().int().min(200),
        text: z.string().min(1).max(280),
      }),
    )
    .max(20),
  captions: z
    .array(
      z.object({
        fromMs: z.number().int().min(0),
        toMs: z.number().int().min(1),
        text: z.string().min(1).max(120),
      }),
    )
    .max(200),
  lowerThirds: z
    .array(
      z.object({
        atMs: z.number().int().min(0),
        durationMs: z.number().int().min(1000).max(6000),
        name: z.string().min(1).max(40),
        relation: z.string().min(1).max(40).optional(),
      }),
    )
    .max(20),
  music: z
    .object({
      src: z.string().min(1),
      gain: z.number().min(0).max(1),
      duckTo: z.number().min(0).max(1),
    })
    .optional(),
  closing: z.object({
    text: z.string().min(1).max(80),
    durationMs: z.number().int().min(1000).max(6000),
  }),
  credit: z.literal('AI-narrated'),
});
export type RenderManifestV1 = z.infer<typeof RenderManifestV1>;
export type RenderManifestV1Input = z.input<typeof RenderManifestV1>;
