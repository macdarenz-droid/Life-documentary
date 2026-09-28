// This phone's Expo push token (P16, D42). There is none until notifications are allowed (the daily
// reminder asks, P9) and the app has an EAS project id (`eas init`, an owner step).
import Constants from 'expo-constants';
import { getExpoPushTokenAsync, getPermissionsAsync } from 'expo-notifications';
import type { PushTokens } from '../../domain/capturePorts';
import { ensureEpisodesChannel } from './channel';

function projectId(): string | null {
  const eas: unknown = Constants.expoConfig?.extra?.eas;
  if (!eas || typeof eas !== 'object' || !('projectId' in eas)) return null;
  return typeof eas.projectId === 'string' && eas.projectId.length > 0 ? eas.projectId : null;
}

export const expoPushTokens: PushTokens = {
  async current() {
    const id = projectId();
    if (!id) return null;
    if ((await getPermissionsAsync()).status !== 'granted') return null;
    await ensureEpisodesChannel();
    return (await getExpoPushTokenAsync({ projectId: id })).data;
  },
};
