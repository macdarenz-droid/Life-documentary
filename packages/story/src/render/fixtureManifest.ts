import type { RenderManifestV1 } from '@life/contracts';

const NARRATION_TEXT = 'It rained all week, and Maya still came over every evening.';

/** A short manifest over the generated fixture media in packages/render/public/fixtures. */
export function fixtureManifest(): RenderManifestV1 {
  return {
    version: 1,
    format: { width: 1080, height: 1920, fps: 30 },
    title: { text: 'Episode 1 · The Week It Rained', subtitle: '12–18 October', durationMs: 3000 },
    shots: [
      { kind: 'video', src: 'fixtures/clip.mp4', durationMs: 4000, inMs: 0 },
      {
        kind: 'photo',
        src: 'fixtures/photo.jpg',
        durationMs: 4000,
        kenBurns: { fromScale: 1.0, toScale: 1.12 },
      },
      { kind: 'video', src: 'fixtures/clip.mp4', durationMs: 3000, inMs: 1000 },
    ],
    narration: [{ src: 'fixtures/voice.wav', atMs: 5000, durationMs: 2500, text: NARRATION_TEXT }],
    captions: [
      { fromMs: 5000, toMs: 6250, text: 'It rained all week,' },
      { fromMs: 6250, toMs: 7500, text: 'and Maya still came over every evening.' },
    ],
    lowerThirds: [{ atMs: 9000, durationMs: 3000, name: 'Maya', relation: 'sister' }],
    music: { src: 'fixtures/music.wav', gain: 0.6, duckTo: 0.15 },
    closing: { text: 'See you next week.', durationMs: 2500 },
    credit: 'AI-narrated',
  };
}
