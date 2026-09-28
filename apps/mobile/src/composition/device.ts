// The device composition shared by the app's screens (app/_layout.tsx) and the background entry: the
// real database, file store and keychain, and the one account and Api client. It lives outside app/
// because nothing may import from the routes folder.
import { Directory, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import type { OpenedStore } from '../application/captureContext';
import { loadOrCreateMasterKey } from '../data/fileStore/masterKey';
import { migrate, migrations } from '../data/migrations';
import { openExpoDriver } from '../data/sqlite/expoDriver';
import { apiBaseUrl, appVersion } from '../services/api/config';
import { createApiClient } from '../services/api/apiClient';
import { createLifeAuthClient } from '../services/auth/authClient';
import { expoEpisodeFiles } from '../services/episodes/expoEpisodeFiles';
import { betterAuthAccount } from '../services/auth/betterAuthAccount';
import { systemClock } from '../services/clock/systemClock';
import { expoCipher } from '../services/crypto/expoCipher';
import { expoFileIO } from '../services/files/expoFileIO';
import { expoIds } from '../services/ids/expoIds';
import { expoKeyStore } from '../services/secureStore/expoKeyStore';

export const account = betterAuthAccount(createLifeAuthClient(apiBaseUrl()));
// Part bytes go through expo/fetch (P6); its types take a BufferSource body.
export const api = createApiClient(
  apiBaseUrl(),
  () => account.cookie(),
  fetch,
  expoFetch as unknown as typeof fetch,
);
/** Episode videos from the Worker with the same session (P16). */
export const episodeFiles = expoEpisodeFiles(apiBaseUrl(), () => account.cookie());
export const device = {
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  appVersion: appVersion(),
} as const;

/** Opens the database (migrated), the master key and the media folder. */
export async function openDeviceStore(): Promise<OpenedStore> {
  const driver = await openExpoDriver('life.db');
  await migrate(driver, systemClock.now(), migrations);
  const masterKey = await loadOrCreateMasterKey(expoKeyStore, expoCipher);
  const storeDir = new Directory(Paths.document, 'media').uri;
  await expoFileIO.ensureDir(storeDir);
  const cacheDir = Paths.cache.uri;
  return {
    store: { driver, io: expoFileIO, cipher: expoCipher, masterKey, storeDir, cacheDir },
    clock: systemClock,
    ids: expoIds,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
