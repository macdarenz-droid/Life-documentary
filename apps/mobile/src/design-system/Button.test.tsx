import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Button } from './Button';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

beforeEach(() => jest.clearAllMocks());

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
});
