import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Tray } from './Tray';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

const mockedReduced = jest.mocked(useReducedMotion);

describe('Tray', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fades in with no transform under reduced motion', async () => {
    mockedReduced.mockReturnValue(true);
    await render(
      <Tray open onClose={() => undefined} label="Note">
        <Text>Inside</Text>
      </Tray>,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    const sheet = screen.getByTestId('tray-sheet');
    expect(sheet).toHaveAnimatedStyle({ opacity: 1 });
    expect(sheet).not.toHaveAnimatedStyle({ transform: [{ translateY: 0 }] });
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });

  it('rises with a transform when motion is allowed', async () => {
    mockedReduced.mockReturnValue(false);
    await render(
      <Tray open onClose={() => undefined} label="Note">
        <Text>Inside</Text>
      </Tray>,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId('tray-sheet')).toHaveAnimatedStyle({
      transform: [{ translateY: 0 }],
    });
  });

  it('renders nothing while closed', async () => {
    await render(
      <Tray open={false} onClose={() => undefined} label="Note">
        <Text>Inside</Text>
      </Tray>,
    );
    expect(screen.queryByText('Inside')).toBeNull();
  });
});
