import { todayHarness } from '../../application/testing/todayHarness';
import { todayScreenProps } from './TodayRoute';

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: () => null,
  Path: () => null,
  Skia: { Path: { Make: () => ({ addArc: () => undefined }) } },
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined, useRouter: () => ({}) }));

// A QuickTime file: an ftyp box with the brand "qt  ", then filler.
const MOV = new Uint8Array(4096).map((_, i) => i & 255);
MOV.set([0, 0, 0, 0x14, ...[...'ftypqt  '].map((c) => c.charCodeAt(0))], 0);
const clip = {
  kind: 'clip' as const,
  media: {
    sourcePath: 'tmp/fake-video.mp4',
    mediaKind: 'video' as const,
    durationMs: 6000,
    width: 1080,
    height: 1920,
  },
  localOnly: false,
};

/** Every stored asset's id and poster path. */
async function assets(h: Awaited<ReturnType<typeof todayHarness>>) {
  return h.store.driver.all<{ id: string; poster_path: string | null }>(
    'SELECT id, poster_path FROM media_assets',
  );
}

describe("TodayRoute's save", () => {
  it('gives a captured video a poster', async () => {
    const h = await todayHarness();
    h.store.io.files.set(clip.media.sourcePath, MOV);
    await todayScreenProps(h.ctx).save(clip);
    const [asset, ...rest] = await assets(h);
    expect(rest).toEqual([]);
    expect(asset?.poster_path).toBe(`store/${asset?.id}.poster.lde`);
  });

  it('keeps the capture when the poster cannot be made', async () => {
    const h = await todayHarness();
    h.store.io.files.set(clip.media.sourcePath, MOV);
    h.services.posters.mode = 'throw';
    await todayScreenProps(h.ctx).save(clip);
    expect(await assets(h)).toEqual([{ id: expect.any(String), poster_path: null }]);
  });
});
