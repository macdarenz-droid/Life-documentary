import { tokens } from '@life/design';
import { words } from '@life/story';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { readDailyReminder } from '../../application/reminders';
import { todayHarness } from '../../application/testing/todayHarness';
import { settingsActions } from './SettingsRoute';
import { SettingsScreen } from './SettingsScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: () => undefined }) }));

async function setup(state: 'undetermined' | 'granted' | 'denied' = 'undetermined') {
  const h = await todayHarness();
  h.services.reminders.state = state;
  await render(<SettingsScreen actions={settingsActions(h.ctx)} />);
  await screen.findByText('08:00');
  return h;
}

const dailySwitch = () => screen.getByRole('switch', { name: words.reminders.dailyQuestion });

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

describe('SettingsScreen', () => {
  it('draws the daily switch in the design-system colours', async () => {
    await setup('granted');
    expect(dailySwitch().props.tintColor).toBe(tokens.color.surface);
    expect(dailySwitch().props.thumbTintColor).toBe(tokens.color.text);
    await act(async () => {
      fireEvent(dailySwitch(), 'valueChange', true);
    });
    expect(dailySwitch().props.onTintColor).toBe(tokens.color.text);
    expect(dailySwitch().props.thumbTintColor).toBe(tokens.color.background);
  });

  it('asks for permission from the switch and turns the reminder on at 08:00', async () => {
    const h = await setup('undetermined');
    expect(dailySwitch().props.value).toBe(false);
    await act(async () => {
      fireEvent(dailySwitch(), 'valueChange', true);
    });
    expect(h.services.reminders.state).toBe('granted');
    expect(dailySwitch().props.value).toBe(true);
    expect([...h.services.reminders.scheduled.values()]).toMatchObject([{ hour: 8, minute: 0 }]);
  });

  it('changes the time in 15-minute steps and reschedules', async () => {
    const h = await setup('granted');
    await act(async () => {
      fireEvent(dailySwitch(), 'valueChange', true);
    });
    await press(words.reminders.step('hour', 1));
    await press(words.reminders.step('minute', 1));
    await press(words.reminders.step('minute', 1));
    expect(screen.getByText('09:30')).toBeOnTheScreen();
    expect([...h.services.reminders.scheduled.values()]).toMatchObject([{ hour: 9, minute: 30 }]);
    await press(words.reminders.step('hour', -1));
    await press(words.reminders.step('minute', -1));
    expect(screen.getByText('08:15')).toBeOnTheScreen();
    expect(await readDailyReminder(h.ctx.store)).toMatchObject({
      enabled: true,
      hour: 8,
      minute: 15,
    });
  });

  it('turns the reminder off and cancels it', async () => {
    const h = await setup('granted');
    await act(async () => {
      fireEvent(dailySwitch(), 'valueChange', true);
    });
    await act(async () => {
      fireEvent(dailySwitch(), 'valueChange', false);
    });
    expect(h.services.reminders.scheduled.size).toBe(0);
    expect(h.services.reminders.cancelled).toHaveLength(1);
    expect(dailySwitch().props.value).toBe(false);
  });

  it('explains a refused permission and opens the system Settings', async () => {
    const h = await setup('denied');
    expect(screen.getByText(words.reminders.denied)).toBeOnTheScreen();
    expect(dailySwitch().props.disabled).toBe(true);
    await press(words.today.openSettings);
    expect(h.services.settings.opened).toBe(1);
    expect(h.services.reminders.scheduled.size).toBe(0);
  });

  it('shows the refused line when the switch is refused', async () => {
    const h = await setup('undetermined');
    h.services.reminders.request = async () => {
      h.services.reminders.state = 'denied';
      return 'denied';
    };
    await act(async () => {
      fireEvent(dailySwitch(), 'valueChange', true);
    });
    expect(screen.getByText(words.reminders.denied)).toBeOnTheScreen();
    expect(h.services.reminders.scheduled.size).toBe(0);
  });
});
