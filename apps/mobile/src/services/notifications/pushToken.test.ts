import { expoPushTokens } from './pushToken';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));

const constants = jest.requireMock<{ default: { expoConfig: { extra: Record<string, unknown> } } }>(
  'expo-constants',
).default;
const notifications = jest.requireMock<{
  getPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
}>('expo-notifications');

function given(extra: Record<string, unknown>, status: string) {
  constants.expoConfig.extra = extra;
  notifications.getPermissionsAsync.mockResolvedValue({ status });
  notifications.getExpoPushTokenAsync.mockReset();
  notifications.getExpoPushTokenAsync.mockResolvedValue({
    type: 'expo',
    data: 'ExponentPushToken[abc]',
  });
}

describe('expoPushTokens', () => {
  it('has no token without a project id', async () => {
    given({}, 'granted');
    expect(await expoPushTokens.current()).toBeNull();
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('has no token without permission', async () => {
    given({ eas: { projectId: 'project-1' } }, 'denied');
    expect(await expoPushTokens.current()).toBeNull();
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('asks for the token with the project id', async () => {
    given({ eas: { projectId: 'project-1' } }, 'granted');
    expect(await expoPushTokens.current()).toBe('ExponentPushToken[abc]');
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1' });
  });
});
