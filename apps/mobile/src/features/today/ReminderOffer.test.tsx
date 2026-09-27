import { words } from '@life/story';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { todayHarness } from '../../application/testing/todayHarness';
import { todayQuestion } from '../../application/todayQuestion';
import { TodayScreen } from './TodayScreen';
import { todayScreenProps } from './TodayRoute';

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: () => null,
  Path: () => null,
  Skia: { Path: { Make: () => ({ addArc: () => undefined }) } },
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  jest.useRealTimers();
});

async function holdTwoSeconds() {
  const button = screen.getByRole('button', { name: words.button.holdToAnswer });
  await act(async () => {
    fireEvent(button, 'pressIn');
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2000);
  });
  await act(async () => {
    fireEvent(button, 'pressOut');
  });
  await screen.findByRole('button', { name: words.button.saved });
}

describe('the reminder card on Today', () => {
  it('appears only on a visit after the first answer, and never again after "Not now"', async () => {
    const h = await todayHarness();
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    const props = todayScreenProps(h.ctx);
    const view = await render(<TodayScreen {...props} reloadKey={0} />);
    await waitFor(() =>
      expect(
        screen.queryByLabelText(question.text) ?? screen.queryByText(question.text),
      ).not.toBeNull(),
    );
    expect(screen.queryByText(words.reminders.offerLine)).toBeNull();

    await holdTwoSeconds();
    // Not in the middle of answering: only on the next visit.
    expect(screen.queryByText(words.reminders.offerLine)).toBeNull();

    await view.rerender(<TodayScreen {...props} reloadKey={1} />);
    expect(await screen.findByText(words.reminders.offerLine)).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: words.reminders.offerDismiss }));
    });
    expect(screen.queryByText(words.reminders.offerLine)).toBeNull();

    await view.rerender(<TodayScreen {...props} reloadKey={2} />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByText(words.reminders.offerLine)).toBeNull();
    expect(h.services.reminders.scheduled.size).toBe(0);
  });

  it('turns the morning reminder on when accepted', async () => {
    const h = await todayHarness();
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    const props = todayScreenProps(h.ctx);
    const view = await render(<TodayScreen {...props} reloadKey={0} />);
    await waitFor(() =>
      expect(
        screen.queryByLabelText(question.text) ?? screen.queryByText(question.text),
      ).not.toBeNull(),
    );
    await holdTwoSeconds();
    await view.rerender(<TodayScreen {...props} reloadKey={1} />);
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: words.reminders.offerAccept }));
    });
    await waitFor(() =>
      expect([...h.services.reminders.scheduled.values()]).toMatchObject([{ hour: 8, minute: 0 }]),
    );
    expect(screen.queryByText(words.reminders.offerLine)).toBeNull();
  });
});
