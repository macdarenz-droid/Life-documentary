// Settings, Account (P4): capture works without an account; signing in is for weekly episodes. Signed
// out: Apple (iPhone only, Apple's own black button), Google, and an email code. Signed in: the email,
// "Sign out" and "Delete account", which asks once and then shows the purge date.
import { tokens } from '@life/design';
import { words } from '@life/story';
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { AppleButtonProps } from '../../domain/capturePorts';
import { Button, Field, Text } from '../../design-system';

/** What the section shows and does; every line it shows comes back from the actions. */
export type AccountActions = {
  /** The signed-in email, or null. */
  load(): Promise<string | null>;
  /** The address the code went to, or the line to show. */
  sendCode(email: string): Promise<{ to?: string; line?: string }>;
  signInWithCode(email: string, code: string): Promise<AccountStep>;
  signInWithApple(): Promise<AccountStep>;
  signInWithGoogle(): Promise<AccountStep>;
  signOut(): Promise<AccountStep>;
  requestDeletion(): Promise<AccountStep>;
};

/** After an action: who is signed in, and a line to show when there is one. */
export type AccountStep = { email: string | null; line?: string };

export type AccountSectionProps = {
  actions: AccountActions;
  AppleButton?: ComponentType<AppleButtonProps>;
};

export function AccountSection({ actions, AppleButton }: AccountSectionProps) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [line, setLine] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void actions.load().then(setEmail);
  }, [actions]);

  const run = useCallback(async (step: () => Promise<AccountStep>) => {
    setBusy(true);
    try {
      const next = await step();
      setEmail(next.email);
      setLine(next.line ?? null);
      if (next.email) {
        setCodeFor(null);
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const send = async () => {
    setBusy(true);
    try {
      const sent = await actions.sendCode(address);
      setLine(sent.line ?? null);
      if (sent.to) setCodeFor(sent.to);
    } finally {
      setBusy(false);
    }
  };

  if (email === undefined) return null;

  return (
    <View style={styles.section}>
      <Text variant="bodyStrong" accessibilityRole="header">
        {words.account.title}
      </Text>

      {email ? (
        <>
          <Text variant="body">{email}</Text>
          {asking ? (
            <View style={styles.group}>
              <Text variant="body">{words.account.deleteAsk}</Text>
              <Button
                label={words.account.deleteConfirm}
                disabled={busy}
                onPress={() => {
                  setAsking(false);
                  void run(() => actions.requestDeletion());
                }}
              />
              <Button label={words.account.keep} variant="quiet" onPress={() => setAsking(false)} />
            </View>
          ) : (
            <View style={styles.group}>
              <Button
                label={words.account.signOut}
                variant="quiet"
                disabled={busy}
                onPress={() => void run(() => actions.signOut())}
              />
              <Button
                label={words.account.deleteAccount}
                variant="quiet"
                disabled={busy}
                onPress={() => setAsking(true)}
              />
            </View>
          )}
        </>
      ) : (
        <>
          <Text variant="caption" tone="secondary">
            {words.account.intro}
          </Text>
          {Platform.OS === 'ios' && AppleButton ? (
            <AppleButton onPress={() => void run(() => actions.signInWithApple())} />
          ) : null}
          <Button
            label={words.account.continueGoogle}
            variant="quiet"
            disabled={busy}
            onPress={() => void run(() => actions.signInWithGoogle())}
          />
          {codeFor ? (
            <View style={styles.group}>
              <Text variant="body">{words.account.codeSent(codeFor)}</Text>
              <Field label={words.account.codeLabel} value={code} onChangeText={setCode} />
              <Button
                label={words.account.signIn}
                disabled={busy || code.trim().length === 0}
                onPress={() => void run(() => actions.signInWithCode(codeFor, code.trim()))}
              />
            </View>
          ) : (
            <View style={styles.group}>
              <Field label={words.account.emailLabel} value={address} onChangeText={setAddress} />
              <Button
                label={words.account.sendCode}
                disabled={busy || address.trim().length === 0}
                onPress={() => void send()}
              />
            </View>
          )}
        </>
      )}

      {line ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text variant="body">{line}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: tokens.space[3] },
  group: { gap: tokens.space[3] },
});
