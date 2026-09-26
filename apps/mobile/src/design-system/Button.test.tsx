import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { Button } from './Button';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

const mockedReducedMotion = jest.mocked(useReducedMotion);

beforeEach(() => {
  jest.clearAllMocks();
  mockedReducedMotion.mockReturnValue(false);
});

afterEach(() => jest.useRealTimers());

async function pressInAndSettle(name: string) {
  jest.useFakeTimers();
  await render(<Button label={name} onPress={jest.fn()} />);
  const button = screen.getByRole('button', { name });
  const before = getAnimatedStyle(button);
  await fireEvent(button, 'pressIn');
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  return { before, after: getAnimatedStyle(button) };
}

describe('Button', () => {
  it('calls onPress once per tap', async () => {
    const onPress = jest.fn();
    await render(<Button label="Hold to answer" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Hold to answer' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled and exposes the disabled state', async () => {
    const onPress = jest.fn();
    await render(<Button label="Saved" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Saved' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('fires a light impact on press-in when haptic="impactLight"', async () => {
    await render(<Button label="Recording" onPress={jest.fn()} haptic="impactLight" />);
    await fireEvent(screen.getByRole('button', { name: 'Recording' }), 'pressIn');
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('fires no haptic without the prop', async () => {
    await render(<Button label="Saved" onPress={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Saved' });
    await fireEvent(button, 'pressIn');
    await fireEvent.press(button);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('with reduced motion on, pressing in dims the opacity and never scales', async () => {
    mockedReducedMotion.mockReturnValue(true);
    const { before, after } = await pressInAndSettle('Keep this');
    expect(before).not.toHaveProperty('transform');
    expect(after).not.toHaveProperty('transform');
    expect(after.opacity).toBeLessThan(1);
  });

  it('with reduced motion off, pressing in scales and leaves opacity alone', async () => {
    const { before, after } = await pressInAndSettle('Keep this');
    expect(before).toMatchObject({ transform: [{ scale: 1 }] });
    expect(after.transform).toEqual([{ scale: expect.any(Number) }]);
    expect((after.transform as { scale: number }[])[0]?.scale).toBeLessThan(1);
    expect(after).not.toHaveProperty('opacity');
  });
});
