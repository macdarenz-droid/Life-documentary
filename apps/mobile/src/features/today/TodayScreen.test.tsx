import { words } from '@life/story';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';
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
});
