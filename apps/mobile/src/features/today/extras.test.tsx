import { words } from '@life/story';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RECORDING_BYTES, todayHarness } from '../../application/testing/todayHarness';
import { todayQuestion } from '../../application/todayQuestion';
import type { CameraViewProps } from '../../domain/capturePorts';
import { TodayScreen } from './TodayScreen';
import { todayScreenProps } from './TodayRoute';

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: () => null,
  Path: () => null,
  Skia: { Path: { Make: () => ({ addArc: () => undefined }) } },
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

type Row = {
  kind: string;
  text: string | null;
  mood: string | null;
  place_name: string | null;
  local_only: number;
  media: string | null;
};

async function setup() {
  const h = await todayHarness();
  const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
  const view = await render(<TodayScreen {...todayScreenProps(h.ctx)} />);
  await waitFor(() =>
    expect(
      screen.queryByLabelText(question.text) ?? screen.queryByText(question.text),
    ).not.toBeNull(),
  );
  const rows = () =>
    h.store.driver.all<Row>(
      `SELECT m.kind, m.text, m.mood, m.place_name, m.local_only, a.kind AS media
       FROM moments m LEFT JOIN media_assets a ON a.id = m.media_asset_id ORDER BY m.rowid`,
    );
  const jobs = async () =>
    (await h.store.driver.first<{ n: number }>('SELECT count(*) AS n FROM upload_jobs'))?.n;
  return { ...h, view, rows, jobs };
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

describe('Today extras', () => {
  it('stores a photo moment with its asset', async () => {
    const { rows } = await setup();
    await press(words.extras.photo);
    await press(words.extras.takePhoto);
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    expect(await rows()).toEqual([
      { kind: 'photo', text: null, mood: null, place_name: null, local_only: 0, media: 'photo' },
    ]);
  });

  it('stores a 30 s library clip', async () => {
    const { rows, services, store } = await setup();
    store.io.files.set('tmp/library.mov', RECORDING_BYTES);
    services.picker.next = {
      uri: 'tmp/library.mov',
      kind: 'video',
      width: 1920,
      height: 1080,
      durationMs: 30_000,
    };
    await press(words.extras.fromLibrary);
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    expect((await rows())[0]).toMatchObject({ kind: 'clip', media: 'video' });
  });

  it('refuses a 61 s library clip and stores nothing', async () => {
    const { rows, services, store } = await setup();
    store.io.files.set('tmp/library.mov', RECORDING_BYTES);
    services.picker.next = {
      uri: 'tmp/library.mov',
      kind: 'video',
      width: 1920,
      height: 1080,
      durationMs: 61_000,
    };
    await press(words.extras.fromLibrary);
    expect(await screen.findByText(words.extras.clipTooLong)).toBeOnTheScreen();
    expect(await rows()).toEqual([]);
  });

  it('stores a note with its text and no asset', async () => {
    const { rows } = await setup();
    await press(words.extras.note);
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText(words.extras.noteLabel),
        '  Rain on the tram window  ',
      );
    });
    await press(words.extras.save);
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    expect(await rows()).toEqual([
      {
        kind: 'note',
        text: 'Rain on the tram window',
        mood: null,
        place_name: null,
        local_only: 0,
        media: null,
      },
    ]);
  });

  it('stores a chosen mood and a confirmed place on the next moment, then resets them', async () => {
    const { rows } = await setup();
    await press(words.moods.calm);
    await press(words.extras.place);
    await act(async () => {
      fireEvent(screen.getByRole('switch', { name: words.extras.placeLabel }), 'valueChange', true);
    });
    expect(await screen.findByText('The harbour')).toBeOnTheScreen();
    await press(words.extras.placeUse);
    await press(words.extras.photo);
    await press(words.extras.takePhoto);
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    await press(words.extras.photo);
    await press(words.extras.takePhoto);
    await waitFor(async () => expect(await rows()).toHaveLength(2));
    const [first, second] = await rows();
    expect(first).toMatchObject({ mood: 'calm', place_name: 'The harbour' });
    expect(second).toMatchObject({ mood: null, place_name: null });
  });

  it('stores no place when the place toggle stays off', async () => {
    const { rows } = await setup();
    await press(words.extras.place);
    expect(screen.queryByText('The harbour')).toBeNull();
    await press(words.extras.photo);
    await press(words.extras.takePhoto);
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    expect((await rows())[0]?.place_name).toBeNull();
  });

  it('keeps a moment on this phone: localOnly and no upload job', async () => {
    const { rows, jobs } = await setup();
    await act(async () => {
      fireEvent(
        screen.getByRole('switch', { name: words.extras.keepOnPhone }),
        'valueChange',
        true,
      );
    });
    await press(words.extras.photo);
    await press(words.extras.takePhoto);
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    expect((await rows())[0]?.local_only).toBe(1);
    expect(await jobs()).toBe(0);
  });

  it('opens a camera view for "Photo" and stores nothing until "Take photo"', async () => {
    const { rows } = await setup();
    expect(screen.queryByTestId('camera-preview')).toBeNull();
    await press(words.extras.photo);
    expect(screen.getByTestId('camera-preview')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: words.button.holdToAnswer })).toBeNull();
    expect(await rows()).toEqual([]);
    await press(words.extras.takePhoto);
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    expect((await rows())[0]).toMatchObject({ kind: 'photo', media: 'photo' });
    expect(screen.queryByTestId('camera-preview')).toBeNull();
  });

  it('stores nothing when the photo view is cancelled', async () => {
    const { rows } = await setup();
    await press(words.extras.photo);
    expect(screen.getByTestId('camera-preview')).toBeOnTheScreen();
    await press(words.extras.cancel);
    expect(screen.queryByTestId('camera-preview')).toBeNull();
    expect(screen.getByRole('button', { name: words.button.holdToAnswer })).toBeOnTheScreen();
    expect(await rows()).toEqual([]);
  });

  it('flips the photo view between the back and the front camera', async () => {
    const h = await todayHarness();
    const Fake = h.ctx.CameraView;
    const given: (string | undefined)[] = [];
    function SpyCamera(props: CameraViewProps) {
      given.push(props.facing);
      return <Fake {...props} />;
    }
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    await render(<TodayScreen {...todayScreenProps(h.ctx)} CameraView={SpyCamera} />);
    await waitFor(() =>
      expect(
        screen.queryByLabelText(question.text) ?? screen.queryByText(question.text),
      ).not.toBeNull(),
    );
    await press(words.extras.photo);
    expect(given.at(-1)).toBe('back');
    await press(words.extras.flip);
    expect(given.at(-1)).toBe('front');
    await press(words.extras.flip);
    expect(given.at(-1)).toBe('back');
  });
});
