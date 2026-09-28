// The Android channel episode pushes arrive on (P16, D42). Android 8+ shows notifications only through
// a channel, and the server sends visible pushes to `episodes`.
import { episodeWords } from '@life/story';
import { AndroidImportance, setNotificationChannelAsync } from 'expo-notifications';
import { Platform } from 'react-native';

export const EPISODES_CHANNEL = 'episodes';

export async function ensureEpisodesChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync(EPISODES_CHANNEL, {
    name: episodeWords.channel,
    importance: AndroidImportance.HIGH,
  });
}
