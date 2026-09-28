import { episodeWords, words } from '@life/story';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { fixedClock } from '../../application/testing/memory';
import { todayHarness } from '../../application/testing/todayHarness';
import { todayQuestion } from '../../application/todayQuestion';
import { TodayScreen } from './TodayScreen';
import { todayScreenProps } from './TodayRoute';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

jest.mock('@shopify/react-native-skia', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    Canvas: ({ children }: { children?: unknown }) => (
      <MockView testID="skia-canvas">{children}</MockView>
    ),
    Path: () => null,
    Skia: { Path: { Make: () => ({ addArc: () => undefined }) } },
  };
});

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

const mockedReduced = jest.mocked(useReducedMotion);

/** The question shows as a Title Card (labelled) the first time and as plain text after that. */
async function findQuestion(text: string) {
  await waitFor(() =>
    expect(screen.queryByLabelText(text) ?? screen.queryByText(text)).not.toBeNull(),
  );
}

async function setup() {
  const h = await todayHarness();
  const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
  const view = await render(<TodayScreen {...todayScreenProps(h.ctx)} />);
  await findQuestion(question.text);
  return { ...h, question, view };
}

async function hold(ms: number) {
  const button = screen.getByRole('button', { name: words.button.holdToAnswer });
  await act(async () => {
    fireEvent(button, 'pressIn');
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    fireEvent(button, 'pressOut');
  });
}

async function answers(store: Awaited<ReturnType<typeof todayHarness>>['store']) {
  return store.driver.all<{ kind: string; question_id: string; media_kind: string }>(
    `SELECT m.kind, m.question_id, a.kind AS media_kind FROM moments m JOIN media_assets a ON a.id = m.media_asset_id`,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedReduced.mockReturnValue(false);
});
afterEach(async () => {
  // Let the Title Card and Record animations finish inside act before the next test renders.
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  jest.useRealTimers();
});

describe('TodayScreen', () => {
  it("shows today's question, and the same one on a second render the same day", async () => {
    const { ctx, question, view } = await setup();
    expect(screen.getByText('Monday 15 March')).toBeOnTheScreen();
    await view.unmount();
    await render(<TodayScreen {...todayScreenProps(ctx)} />);
    await findQuestion(question.text);
  });

  it('saves an answer after a two-second hold', async () => {
    const { store, question } = await setup();
    await hold(2000);
    expect(await screen.findByRole('button', { name: words.button.saved })).toBeOnTheScreen();
    expect(await answers(store)).toEqual([
      { kind: 'answer', question_id: question.id, media_kind: 'video' },
    ]);
  });

  it('saves nothing and asks to hold longer after half a second', async () => {
    const { store } = await setup();
    await hold(500);
    expect(await screen.findByText(words.today.holdLonger)).toBeOnTheScreen();
    expect(await answers(store)).toEqual([]);
  });

  it('stops at ten seconds and saves', async () => {
    const { store, services } = await setup();
    const stop = jest.spyOn(services.video, 'stop');
    const button = screen.getByRole('button', { name: words.button.holdToAnswer });
    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(9999);
    });
    expect(stop).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2001);
    });
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent(button, 'pressOut');
    });
    expect(await screen.findByRole('button', { name: words.button.saved })).toBeOnTheScreen();
    expect(await answers(store)).toHaveLength(1);
  });

  it('records through the voice recorder in voice mode', async () => {
    const { store, services } = await setup();
    const stop = jest.spyOn(services.voice, 'stop');
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: words.today.modeVoice }));
    });
    await hold(2000);
    expect(await screen.findByRole('button', { name: words.button.saved })).toBeOnTheScreen();
    expect(stop).toHaveBeenCalledTimes(1);
    expect((await answers(store))[0]?.media_kind).toBe('audio');
  });

  it('explains a denied camera and records nothing', async () => {
    const h = await todayHarness();
    h.services.permissions.set('camera', 'denied');
    const start = jest.spyOn(h.services.video, 'start');
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    await render(<TodayScreen {...todayScreenProps(h.ctx)} />);
    await findQuestion(question.text);
    await hold(2000);
    expect(await screen.findByText(words.permissions.denied.camera)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: words.today.openSettings }));
    expect(h.services.settings.opened).toBe(1);
    expect(start).not.toHaveBeenCalled();
    expect(await answers(h.store)).toEqual([]);
  });

  it('counts down instead of drawing the ring under reduced motion', async () => {
    mockedReduced.mockReturnValue(true);
    await setup();
    await act(async () => {
      fireEvent(screen.getByRole('button', { name: words.button.holdToAnswer }), 'pressIn');
    });
    expect(await screen.findByText('0:10')).toBeOnTheScreen();
    expect(screen.queryByTestId('skia-canvas')).toBeNull();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText('0:07')).toBeOnTheScreen();
  });

  it('runs the camera only during a video hold', async () => {
    await setup();
    expect(screen.queryByTestId('camera-preview')).toBeNull();
    const button = screen.getByRole('button', { name: words.button.holdToAnswer });
    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId('camera-preview')).toBeOnTheScreen();
    await act(async () => {
      fireEvent(button, 'pressOut');
    });
    expect(await screen.findByRole('button', { name: words.button.saved })).toBeOnTheScreen();
    expect(screen.queryByTestId('camera-preview')).toBeNull();
  });

  it('never mounts the camera in voice mode', async () => {
    await setup();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: words.today.modeVoice }));
    });
    const button = screen.getByRole('button', { name: words.button.holdToAnswer });
    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByTestId('camera-preview')).toBeNull();
    await act(async () => {
      fireEvent(button, 'pressOut');
    });
    expect(await screen.findByRole('button', { name: words.button.saved })).toBeOnTheScreen();
    expect(screen.queryByTestId('camera-preview')).toBeNull();
  });

  it('gives up after three seconds when the camera never hands out a recorder', async () => {
    const h = await todayHarness();
    function SilentCamera() {
      return <View testID="camera-preview" />;
    }
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    await render(<TodayScreen {...todayScreenProps(h.ctx)} CameraView={SilentCamera} />);
    await findQuestion(question.text);
    const button = screen.getByRole('button', { name: words.button.holdToAnswer });
    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2999);
    });
    expect(screen.queryByText(words.today.cameraNotReady)).toBeNull();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText(words.today.cameraNotReady)).toBeOnTheScreen();
    expect(screen.queryByTestId('camera-preview')).toBeNull();
    await act(async () => {
      fireEvent(button, 'pressOut');
    });
    expect(await answers(h.store)).toEqual([]);
  });

  it('cancels without saving when released before the camera is ready', async () => {
    const h = await todayHarness();
    function SilentCamera() {
      return <View testID="camera-preview" />;
    }
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    await render(<TodayScreen {...todayScreenProps(h.ctx)} CameraView={SilentCamera} />);
    await findQuestion(question.text);
    await hold(1500);
    expect(await screen.findByText(words.today.holdLonger)).toBeOnTheScreen();
    expect(screen.queryByTestId('camera-preview')).toBeNull();
    expect(await answers(h.store)).toEqual([]);
  });

  it("shows the new day's date and question after midnight", async () => {
    const h = await todayHarness('2027-03-15T22:30:00Z');
    const first = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    const props = todayScreenProps(h.ctx);
    const view = await render(<TodayScreen {...props} reloadKey={0} />);
    await findQuestion(first.text);
    expect(screen.getByText('Monday 15 March')).toBeOnTheScreen();
    (h.ctx.clock as ReturnType<typeof fixedClock>).set('2027-03-15T23:30:00Z');
    await view.rerender(<TodayScreen {...props} reloadKey={1} />);
    expect(await screen.findByText('Tuesday 16 March')).toBeOnTheScreen();
    const next = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    expect(next.askedOn).toBe('2027-03-16');
    await findQuestion(next.text);
    expect(screen.queryByText('Monday 15 March')).toBeNull();
  });

  it('says the answer could not be saved when saving fails', async () => {
    const h = await todayHarness();
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    const save = jest.fn(async () => {
      throw new Error('disk full');
    });
    await render(<TodayScreen {...todayScreenProps(h.ctx)} save={save} />);
    await findQuestion(question.text);
    await hold(2000);
    expect(await screen.findByText(words.today.couldNotSave)).toBeOnTheScreen();
    expect(save).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('opens Storylines and Cast from the quiet top row of links', async () => {
    const h = await todayHarness();
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    const onNavigate = jest.fn();
    await render(<TodayScreen {...todayScreenProps(h.ctx)} onNavigate={onNavigate} />);
    await findQuestion(question.text);
    await act(async () => {
      fireEvent.press(screen.getByRole('link', { name: words.nav.storylines }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('link', { name: words.nav.cast }));
    });
    expect(onNavigate.mock.calls).toEqual([['storylines'], ['cast']]);
  });

  it("links to Episodes with this week's line", async () => {
    const h = await todayHarness();
    // A Sunday after the first full week, after 06:00 and before the 18:00 delivery in Berlin.
    (h.ctx.clock as ReturnType<typeof fixedClock>).set('2027-03-28T10:00:00Z');
    const onOpenEpisodes = jest.fn();
    await render(
      <TodayScreen
        {...todayScreenProps(h.ctx)}
        onNavigate={jest.fn()}
        onOpenEpisodes={onOpenEpisodes}
      />,
    );
    const link = await screen.findByRole('link', { name: episodeWords.making(18) });
    await act(async () => {
      fireEvent.press(link);
    });
    expect(onOpenEpisodes).toHaveBeenCalledTimes(1);
  });
});
