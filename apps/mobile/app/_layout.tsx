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
import { CaptureRoot } from '../src/application';
import { account, api, device, openDeviceStore } from '../src/composition/device';
import type { CaptureServices } from '../src/domain/capturePorts';
import { useExpoVoiceRecorder } from '../src/services/audio/expoVoiceRecorder';
import { expoHaptics } from '../src/services/haptics/expoHaptics';
import { expoPermissions } from '../src/services/permissions/expoPermissions';
import { expoReminders } from '../src/services/notifications/expoReminders';
import { expoPushTokens } from '../src/services/notifications/pushToken';
import { EpisodeTaps } from '../src/services/notifications/taps';
import { expoLibraryPicker } from '../src/services/picker/expoLibraryPicker';
import { expoPlaceFinder } from '../src/services/place/expoPlaceFinder';
import { CameraRecorderView } from '../src/services/camera/CameraRecorderView';
import { systemSettings } from '../src/services/settings/systemSettings';
import { expoPosterMaker } from '../src/services/posters/expoPosterMaker';
import { expoPlayback } from '../src/services/playback';
import { AppleSignInButton } from '../src/services/auth/AppleSignInButton';
import { expoBackgroundUploads } from '../src/services/background/uploadTask';
import { expoNetwork } from '../src/services/network/expoNetwork';

void SplashScreen.preventAutoHideAsync();

const reminders = expoReminders(words.reminders.channelName);

// Composition root for capture: the device store and services (src/composition/device.ts) and the
// device-only views.
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
      account,
      api,
      device,
      network: expoNetwork,
      background: expoBackgroundUploads,
      pushTokens: expoPushTokens,
    }),
    [voice],
  );
  return (
    <CaptureRoot
      open={openDeviceStore}
      services={services}
      CameraView={CameraRecorderView}
      Playback={expoPlayback}
      AppleButton={AppleSignInButton}
      NotificationTaps={EpisodeTaps}
    >
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
