// The Settings route: the capture context turned into the screen's actions. Without a capture context
// (the web preview) the reminder cannot be scheduled, so the screen shows it off and refused.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
import { readDailyReminder, setDailyReminder } from '../../application/reminders';
import { SettingsScreen, type SettingsActions } from './SettingsScreen';

export function settingsActions(ctx: CaptureContextValue): SettingsActions {
  const { store, services } = ctx;
  return {
    load: async () => ({
      permission: await services.reminders.permission(),
      reminder: await readDailyReminder(store),
    }),
    request: () => services.reminders.request(),
    save: (choice) => setDailyReminder(store, services.reminders, choice),
    openSettings: () => services.settings.open(),
  };
}

const NO_STORE: SettingsActions = {
  load: async () => ({ permission: 'denied', reminder: { enabled: false, hour: 8, minute: 0 } }),
  request: async () => 'denied',
  save: async () => undefined,
  openSettings: () => undefined,
};

export function SettingsRoute() {
  const ctx = useOptionalCapture();
  const router = useRouter();
  const [actions] = useState(() => (ctx ? settingsActions(ctx) : NO_STORE));
  return <SettingsScreen actions={actions} onBack={() => router.back()} />;
}
