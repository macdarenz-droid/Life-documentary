import { RenderManifestV2 } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import { fixtureManifest, manifestErrors, msToFrames } from '../src';

describe('fixtureManifest', () => {
  it.each(['portrait', 'landscape'] as const)('parses and has no timeline errors in %s', (f) => {
    const m = fixtureManifest(f);
    expect(RenderManifestV2.safeParse(m).success).toBe(true);
    expect(manifestErrors(m)).toEqual([]);
  });

  it('draws 9:16 by default and 16:9 on request', () => {
    expect(fixtureManifest().format).toEqual({ width: 1080, height: 1920 });
    expect(fixtureManifest('landscape').format).toEqual({ width: 1920, height: 1080 });
  });

  it('has every part the renderer draws', () => {
    const m = fixtureManifest();
    expect(m.segments.map((s) => s.kind)).toEqual([
      'coldOpen',
      'title',
      'sceneOpen',
      'shot',
      'shot',
      'shot',
      'shot',
      'closing',
      'tease',
    ]);
    const media = m.segments.flatMap((s) =>
      s.kind === 'shot' || s.kind === 'coldOpen' ? [s.media] : [],
    );
    expect(media.map((x) => (x.type === 'video' ? `video:${x.sound}` : x.type))).toEqual([
      'video:full',
      'video:full',
      'photo',
      'video:natural',
      'voice',
    ]);
    expect(m.sceneLabels).toHaveLength(1);
    expect(m.lowerThirds).toHaveLength(1);
    expect(m.narration).toHaveLength(2);
    expect(m.music).toBeDefined();
  });

  it('lasts 30 seconds or less', () => {
    expect(fixtureManifest().durationMs).toBeLessThanOrEqual(30_000);
  });
});

describe('msToFrames', () => {
  it('rounds to the nearest frame', () => {
    expect(msToFrames(1000, 30)).toBe(30);
    expect(msToFrames(33, 30)).toBe(1);
  });
});
