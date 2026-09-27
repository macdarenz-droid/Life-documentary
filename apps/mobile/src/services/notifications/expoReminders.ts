// The daily reminder through expo-notifications: a local DAILY trigger, no push credentials.
import {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';
import { Platform } from 'react-native';
import type { Reminders } from '../../domain/capturePorts';
import { toPermissionState } from '../permissions/state';

const CHANNEL_ID = 'daily-question';

/** Android 8+ shows notifications through a channel; Android 13 asks for permission only once one exists. */
async function ensureChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync(CHANNEL_ID, { name, importance: AndroidImportance.DEFAULT });
}

export function expoReminders(channelName: string): Reminders {
  return {
    permission: async () => toPermissionState((await getPermissionsAsync()).status),
    request: async () => {
      await ensureChannel(channelName);
      return toPermissionState((await requestPermissionsAsync()).status);
    },
    scheduleDaily: async (hour, minute, content) => {
      await ensureChannel(channelName);
      return scheduleNotificationAsync({
        content,
        trigger: { type: SchedulableTriggerInputTypes.DAILY, channelId: CHANNEL_ID, hour, minute },
      });
    },
    cancel: (id) => cancelScheduledNotificationAsync(id),
  };
}
