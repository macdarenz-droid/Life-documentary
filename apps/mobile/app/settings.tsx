import { Stack } from 'expo-router';
import { SettingsRoute } from '../src/features/settings';

export default function Settings() {
  return (
    <>
      <Stack.Screen options={{ animation: 'fade' }} />
      <SettingsRoute />
    </>
  );
}
