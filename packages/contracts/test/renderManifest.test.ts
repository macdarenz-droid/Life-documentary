import { describe, expect, it } from 'vitest';
import { RenderManifestV1, RenderManifestV2 } from '../src';

const valid = {
  version: 1,
  format: { width: 1080, height: 1920, fps: 30 },
  title: { text: 'Episode 1', durationMs: 3000 },
  shots: [{ kind: 'photo', src: 'fixtures/photo.jpg', durationMs: 4000 }],
  narration: [],
  captions: [],
  lowerThirds: [],
  closing: { text: 'See you next week.', durationMs: 2500 },
  credit: 'AI-narrated',
};

describe('RenderManifestV1', () => {
  it('accepts a minimal manifest and defaults a video inMs to 0', () => {
    expect(RenderManifestV1.safeParse(valid).success).toBe(true);
    const withVideo = RenderManifestV1.parse({
      ...valid,
      shots: [{ kind: 'video', src: 'fixtures/clip.mp4', durationMs: 4000 }],
    });
    expect(withVideo.shots[0]).toMatchObject({ kind: 'video', inMs: 0 });
  });

  it('rejects a landscape format', () => {
    const m = { ...valid, format: { width: 1920, height: 1080, fps: 30 } };
    expect(RenderManifestV1.safeParse(m).success).toBe(false);
  });

  it('rejects an empty shot list', () => {
    expect(RenderManifestV1.safeParse({ ...valid, shots: [] }).success).toBe(false);
  });

  it('rejects a manifest without the credit', () => {
    const withoutCredit: Record<string, unknown> = { ...valid };
    delete withoutCredit.credit;
    expect(RenderManifestV1.safeParse(withoutCredit).success).toBe(false);
  });
});

const shot = (fromMs: number) => ({
  kind: 'shot',
  fromMs,
  toMs: fromMs + 1000,
  media: { type: 'photo', src: 'p.jpg' },
});
const v2 = {
  version: 2,
  format: { width: 1080, height: 1920 },
  fps: 30,
  durationMs: 1000,
  segments: [shot(0)],
  narration: [],
  speech: [
    {
      kind: 'person',
      fromMs: 0,
      toMs: 1000,
      captions: true,
      approximate: false,
      words: [{ text: 'Hi', fromMs: 0, toMs: 400 }],
    },
  ],
  sceneLabels: [],
  lowerThirds: [],
};

describe('RenderManifestV2', () => {
  it('accepts a minimal manifest in 9:16 and 16:9', () => {
    expect(RenderManifestV2.safeParse(v2).success).toBe(true);
    expect(
      RenderManifestV2.safeParse({ ...v2, format: { width: 1920, height: 1080 } }).success,
    ).toBe(true);
    expect(
      RenderManifestV2.safeParse({ ...v2, format: { width: 1080, height: 1080 } }).success,
    ).toBe(false);
  });

  it('refuses a word that ends before it starts', () => {
    const speech = [{ ...v2.speech[0], words: [{ text: 'Hi', fromMs: 400, toMs: 100 }] }];
    expect(RenderManifestV2.safeParse({ ...v2, speech }).success).toBe(false);
  });

  it('refuses 41 segments', () => {
    const segments = Array.from({ length: 41 }, (_, i) => shot(i * 1000));
    expect(RenderManifestV2.safeParse({ ...v2, segments, durationMs: 41_000 }).success).toBe(false);
    expect(
      RenderManifestV2.safeParse({ ...v2, segments: segments.slice(0, 40), durationMs: 40_000 })
        .success,
    ).toBe(true);
  });
});
