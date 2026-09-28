import { Slot } from 'expo-router';
import { act, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { EpisodeTaps } from './taps';

type Listener = (response: unknown) => void;

jest.mock('expo-notifications', () => ({
  getLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));

const notifications = jest.requireMock<{
  getLastNotificationResponse: jest.Mock;
  clearLastNotificationResponse: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
}>('expo-notifications');

const EPISODE = '00000000-0000-4000-8000-000000000012';
let listeners: Listener[] = [];

function response(identifier: string, data: Record<string, unknown>) {
  return { notification: { request: { identifier, content: { data } } } };
}

async function tap(value: unknown) {
  await act(async () => listeners.forEach((listener) => listener(value)));
}

/** Renders the app and gives back the router's current pathname. */
async function renderApp(last: unknown = null): Promise<() => string> {
  notifications.getLastNotificationResponse.mockReturnValue(last);
  const result = renderRouter(
    {
      _layout: () => (
        <>
          <EpisodeTaps />
          <Slot />
        </>
      ),
      index: () => <Text>Today</Text>,
      'episode/[id]': () => <Text>Episode</Text>,
    },
    { initialUrl: '/' },
  );
  await result;
  return () => result.getPathname();
}

beforeEach(() => {
  listeners = [];
  notifications.clearLastNotificationResponse.mockClear();
  notifications.addNotificationResponseReceivedListener.mockImplementation((l: Listener) => {
    listeners.push(l);
    return { remove: () => undefined };
  });
});

describe('useEpisodeTaps', () => {
  it('opens the episode a push was tapped for on a cold start, then clears the response', async () => {
    const pathname = await renderApp(response('n-1', { episodeId: EPISODE }));
    expect(await screen.findByText('Episode')).toBeTruthy();
    expect(pathname()).toBe(`/episode/${EPISODE}`);
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalled();
  });

  it('opens the episode from a tap while running', async () => {
    const pathname = await renderApp();
    expect(await screen.findByText('Today')).toBeTruthy();
    await tap(response('n-2', { episodeId: EPISODE }));
    expect(await screen.findByText('Episode')).toBeTruthy();
    expect(pathname()).toBe(`/episode/${EPISODE}`);
  });

  it('ignores an id that is not a UUID', async () => {
    const pathname = await renderApp(response('n-3', { episodeId: '../settings' }));
    expect(await screen.findByText('Today')).toBeTruthy();
    await tap(response('n-4', { other: 'x' }));
    expect(pathname()).toBe('/');
    expect(notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
  });
});
