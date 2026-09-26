import { describe, expect, it } from 'vitest';
import { RenderManifestV1 } from '../src';

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
