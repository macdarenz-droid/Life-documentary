import { words } from '@life/story';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { captureMoment } from '../../application/captureMoment';
import { todayHarness } from '../../application/testing/todayHarness';
import { viewerActions } from '../footage/FootageRoute';
import { MomentViewer } from '../footage/MomentViewer';
import { TodayScreen } from './TodayScreen';
import { todayScreenProps } from './TodayRoute';

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: () => null,
  Path: () => null,
  Skia: { Path: { Make: () => ({ addArc: () => undefined }) } },
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

type Harness = Awaited<ReturnType<typeof todayHarness>>;
const setClock = (h: Harness, at: string) =>
  (h.ctx.clock as typeof h.ctx.clock & { set(next: string): void }).set(at);

async function showToday(h: Harness) {
  const onOpenMoments = jest.fn();
  await render(<TodayScreen {...todayScreenProps(h.ctx)} onOpenMoments={onOpenMoments} />);
  await screen.findByRole('button', { name: words.button.holdToAnswer });
  // Let the card's own load settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return onOpenMoments;
}

describe('One year ago today', () => {
  it('shows a card for a moment from the same day last year and opens the viewer on it', async () => {
    const h = await todayHarness('2027-03-15T09:30:00Z');
    setClock(h, '2026-03-15T18:10:00Z');
    const old = await captureMoment(h.store, h.ctx.clock, h.ctx.ids, {
      kind: 'note',
      text: 'The first warm evening.',
      localOnly: false,
    });
    setClock(h, '2027-03-15T09:30:00Z');

    const onOpenMoments = await showToday(h);
    const card = await screen.findByRole('button', {
      name: `${words.footage.oneYearAgo}, The first warm evening.`,
    });
    expect(screen.getByText(words.footage.oneYearAgo)).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(card);
    });
    expect(onOpenMoments).toHaveBeenCalledWith([old.id]);

    await render(
      <MomentViewer
        id={old.id}
        actions={viewerActions(h.ctx)}
        Playback={h.ctx.Playback!}
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByText('The first warm evening.')).toBeOnTheScreen();
  });

  it('shows no card when that day has no moments', async () => {
    const h = await todayHarness('2027-03-15T09:30:00Z');
    setClock(h, '2026-03-14T18:10:00Z');
    await captureMoment(h.store, h.ctx.clock, h.ctx.ids, {
      kind: 'note',
      text: 'The day before.',
      localOnly: false,
    });
    setClock(h, '2027-03-15T09:30:00Z');
    await showToday(h);
    expect(screen.queryByText(words.footage.oneYearAgo)).toBeNull();
  });
});
