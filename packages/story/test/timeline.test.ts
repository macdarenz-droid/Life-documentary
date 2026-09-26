import { RenderManifestV1 } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import {
  fixtureManifest,
  manifestDurationMs,
  msToFrames,
  musicVolumeAt,
  shotStartsMs,
  validateTimeline,
} from '../src';

// Title 3000 + shots 4000 + 4000 + 3000 + closing 2500.
const FIXTURE_DURATION_MS = 16500;

function errorsOf(m: RenderManifestV1): string[] {
  const result = validateTimeline(m);
  return result.ok ? [] : result.errors;
}

describe('fixtureManifest', () => {
  it('parses with RenderManifestV1 and passes validateTimeline', () => {
    expect(RenderManifestV1.safeParse(fixtureManifest()).success).toBe(true);
    expect(validateTimeline(fixtureManifest())).toEqual({ ok: true });
  });

  it('lasts 30 seconds or less', () => {
    expect(manifestDurationMs(fixtureManifest())).toBeLessThanOrEqual(30000);
  });
});

describe('manifestDurationMs and shotStartsMs', () => {
  it('match the hand-computed fixture values', () => {
    expect(manifestDurationMs(fixtureManifest())).toBe(FIXTURE_DURATION_MS);
    expect(shotStartsMs(fixtureManifest())).toEqual([3000, 7000, 11000]);
  });
});

describe('msToFrames', () => {
  it('rounds to the nearest frame', () => {
    expect(msToFrames(1000, 30)).toBe(30);
    expect(msToFrames(33, 30)).toBe(1);
  });
});

describe('validateTimeline', () => {
  it('reports a caption that ends after the episode', () => {
    const m = fixtureManifest();
    m.captions.push({ fromMs: 16000, toMs: 16501, text: 'late' });
    expect(errorsOf(m)).toEqual([expect.stringMatching(/caption 2 ends after/)]);
  });

  it('reports narration that ends after the episode', () => {
    const m = fixtureManifest();
    m.narration.push({ src: 'fixtures/voice.wav', atMs: 16000, durationMs: 600, text: 'late' });
    expect(errorsOf(m)).toEqual([expect.stringMatching(/narration 1 ends after/)]);
  });

  it('reports a lower-third that ends after the episode', () => {
    const m = fixtureManifest();
    m.lowerThirds.push({ atMs: 15000, durationMs: 2000, name: 'Sam' });
    expect(errorsOf(m)).toEqual([expect.stringMatching(/lower-third 1 ends after/)]);
  });

  it('reports a caption whose end is not after its start', () => {
    const m = fixtureManifest();
    m.captions.push({ fromMs: 9000, toMs: 9000, text: 'empty' });
    expect(errorsOf(m)).toEqual([expect.stringMatching(/caption 2 ends at or before/)]);
  });

  it('reports overlapping narration and accepts touching narration', () => {
    const touching = fixtureManifest();
    touching.narration.push({
      src: 'fixtures/voice.wav',
      atMs: 7500,
      durationMs: 500,
      text: 'next',
    });
    expect(validateTimeline(touching)).toEqual({ ok: true });

    const m = fixtureManifest();
    m.narration.push({ src: 'fixtures/voice.wav', atMs: 7499, durationMs: 500, text: 'next' });
    expect(errorsOf(m)).toEqual(['narration 0 overlaps narration 1']);
  });

  it("reports overlapping captions (the fixture's touching captions pass)", () => {
    const m = fixtureManifest();
    m.captions.push({ fromMs: 7000, toMs: 8000, text: 'over' });
    expect(errorsOf(m)).toEqual(['caption 1 overlaps caption 2']);
  });
});

describe('musicVolumeAt', () => {
  const m = fixtureManifest();

  it('is 0 at the start', () => {
    expect(musicVolumeAt(0, m)).toBe(0);
  });

  it('is the full gain far from narration and from both ends', () => {
    // 2.5 s after the narration ends (7500) and 6.5 s before the end.
    expect(musicVolumeAt(10000, m)).toBeCloseTo(0.6, 10);
  });

  it('is duckTo in the middle of the narration', () => {
    expect(musicVolumeAt(6250, m)).toBeCloseTo(0.15, 10);
  });

  it('is strictly between duckTo and gain 150 ms before the narration', () => {
    const v = musicVolumeAt(4850, m);
    expect(v).toBeGreaterThan(0.15);
    expect(v).toBeLessThan(0.6);
  });

  it('is 0 at the last millisecond', () => {
    expect(musicVolumeAt(FIXTURE_DURATION_MS, m)).toBe(0);
  });

  it('is 0 everywhere without music', () => {
    const silent = fixtureManifest();
    delete silent.music;
    for (const ms of [0, 1000, 6250, 10000, FIXTURE_DURATION_MS]) {
      expect(musicVolumeAt(ms, silent)).toBe(0);
    }
  });
});
