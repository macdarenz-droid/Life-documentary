import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { tokens } from '@life/design';
import { words } from '@life/story';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Directory, Paths } from 'expo-file-system';
import { CaptureRoot, type OpenedStore } from '../src/application';
import type { CaptureServices } from '../src/domain/capturePorts';
import { loadOrCreateMasterKey } from '../src/data/fileStore/masterKey';
import { migrate, migrations } from '../src/data/migrations';
import { openExpoDriver } from '../src/data/sqlite/expoDriver';
import { useExpoVoiceRecorder } from '../src/services/audio/expoVoiceRecorder';
import { systemClock } from '../src/services/clock/systemClock';
import { expoCipher } from '../src/services/crypto/expoCipher';
import { expoFileIO } from '../src/services/files/expoFileIO';
import { expoHaptics } from '../src/services/haptics/expoHaptics';
import { expoIds } from '../src/services/ids/expoIds';
import { expoPermissions } from '../src/services/permissions/expoPermissions';
import { expoReminders } from '../src/services/notifications/expoReminders';
import { expoLibraryPicker } from '../src/services/picker/expoLibraryPicker';
import { expoPlaceFinder } from '../src/services/place/expoPlaceFinder';
import { CameraRecorderView } from '../src/services/camera/CameraRecorderView';
import { systemSettings } from '../src/services/settings/systemSettings';
import { expoKeyStore } from '../src/services/secureStore/expoKeyStore';
import { expoPosterMaker } from '../src/services/posters/expoPosterMaker';

void SplashScreen.preventAutoHideAsync();

const reminders = expoReminders(words.reminders.channelName);

// Composition root for capture: the real database, file store, keychain and device services. It lives
// here because nothing may import from app/ (the routes folder).
async function openDeviceStore(): Promise<OpenedStore> {
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

export function CaptureProvider({ children }: { children: ReactNode }) {
  const voice = useExpoVoiceRecorder();
  const services = useMemo<CaptureServices>(
    () => ({
      voice,
      picker: expoLibraryPicker,
      place: expoPlaceFinder,
      haptics: expoHaptics,
      permissions: expoPermissions,
      settings: systemSettings,
      reminders,
      posters: expoPosterMaker,
    }),
    [voice],
  );
  return (
    <CaptureRoot open={openDeviceStore} services={services} CameraView={CameraRecorderView}>
      {children}
    </CaptureRoot>
  );
}

let warnedFontError = false;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Inter_400Regular,
    Inter_600SemiBold,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (fontError && !warnedFontError) {
      warnedFontError = true;
      console.warn('Fonts failed to load; using system fonts.', fontError);
    }
    if (ready) void SplashScreen.hideAsync();
  }, [ready, fontError]);

  if (!ready) return null;

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.color.background },
      }}
    />
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      {Platform.OS === 'web' ? (
        // The web build is the Design Lab preview: no device store.
        stack
      ) : (
        <CaptureProvider>{stack}</CaptureProvider>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.background },
});
