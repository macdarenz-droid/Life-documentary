// The Settings route: the capture context turned into the screen's actions. Without a capture context
// (the web preview) the reminder cannot be scheduled, so the screen shows it off and refused, and there
// is no Account section.
import { words } from '@life/story';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useOptionalCapture, type CaptureContextValue } from '../../application/captureContext';
import {
  requestAccountDeletion,
  sendSignInCode,
  signInAndLink,
  type AccountDeps,
} from '../../application/account';
import { readDailyReminder, setDailyReminder } from '../../application/reminders';
import type { AccountActions, AccountStep } from './AccountSection';
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

/** The Account section's actions: sign-in runs the first link once; the link's new owner id reaches every screen. */
export function accountActions(ctx: CaptureContextValue): AccountActions {
  const { store, clock, ids, services } = ctx;
  const { account, api } = services;
  let documentary = ctx.documentary;
  const deps = (): AccountDeps => ({
    store,
    clock,
    account,
    api,
    documentary,
    device: {
      ...services.device,
      newId: () => ids.newId(),
      ...(services.pushTokens ? { pushTokens: services.pushTokens } : {}),
    },
  });
  const signIn = async (how: Parameters<typeof signInAndLink>[1]): Promise<AccountStep> => {
    const outcome = await signInAndLink(deps(), how);
    if (outcome.documentary) {
      documentary = outcome.documentary;
      ctx.setDocumentary?.(outcome.documentary);
    }
    // Signed in and linked: the first sync round.
    if (outcome.user && !outcome.line) ctx.requestSync?.();
    return { email: outcome.user?.email ?? null, ...(outcome.line ? { line: outcome.line } : {}) };
  };
  return {
    load: async () => (await account.session().catch(() => null))?.email ?? null,
    sendCode: (email) => sendSignInCode(account, email),
    signInWithCode: (email, code) => signIn(() => account.signInWithCode(email, code)),
    signInWithApple: () => signIn(() => account.signInWithApple()),
    signInWithGoogle: () => signIn(() => account.signInWithGoogle()),
    signOut: async () => {
      try {
        await account.signOut();
        return { email: null };
      } catch (error) {
        console.error('Sign-out failed.', error);
        const still = await account.session().catch(() => null);
        return { email: still?.email ?? null, line: words.account.signOutFailed };
      }
    },
    requestDeletion: async () => {
      const result = await requestAccountDeletion(deps());
      if (result.ok) return { email: null, line: result.line };
      const still = await account.session().catch(() => null);
      return { email: still?.email ?? null, line: result.line };
    },
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
  const [account] = useState(() => (ctx ? accountActions(ctx) : undefined));
  return (
    <SettingsScreen
      actions={actions}
      onBack={() => router.back()}
      {...(account ? { account } : {})}
      {...(ctx?.AppleButton ? { AppleButton: ctx.AppleButton } : {})}
    />
  );
}
