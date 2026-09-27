// Settings (P9): the one daily reminder. A "Daily question" switch and its time, in 15-minute steps.
// Undecided permission: the switch asks. Refused: a plain line and "Open Settings".
import { tokens } from '@life/design';
import { words } from '@life/story';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import type { PermissionState } from '../../domain/capturePorts';
import { Button, Text } from '../../design-system';

export type ReminderChoice = { enabled: boolean; hour: number; minute: number };

export type SettingsActions = {
  load(): Promise<{ permission: PermissionState; reminder: ReminderChoice }>;
  request(): Promise<PermissionState>;
  save(choice: ReminderChoice): Promise<unknown>;
  openSettings(): void;
};

export type SettingsScreenProps = {
  actions: SettingsActions;
  /** Back to Today; absent in the Design Lab. */
  onBack?: () => void;
};

const MINUTE_STEP = 15;

const two = (n: number) => String(n).padStart(2, '0');

/** One number with Earlier and Later; screen readers adjust it with swipe up and down. */
function Stepper({
  label,
  value,
  onStep,
  disabled,
}: {
  label: string;
  value: number;
  onStep: (direction: 1 | -1) => void;
  disabled: boolean;
}) {
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onStep(1);
    if (e.nativeEvent.actionName === 'decrement') onStep(-1);
  };
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: two(value) }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={disabled ? undefined : onAction}
    >
      <Text variant="caption" tone="secondary" accessibilityRole="none">
        {label}
      </Text>
      <View style={styles.stepRow}>
        {([-1, 1] as const).map((direction) => (
          <Pressable
            key={direction}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${direction < 0 ? words.reminders.earlier : words.reminders.later}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onStep(direction)}
            style={styles.step}
          >
            <Text variant="label" tone={disabled ? 'secondary' : 'text'} accessibilityRole="none">
              {direction < 0 ? words.reminders.earlier : words.reminders.later}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function SettingsScreen({ actions, onBack }: SettingsScreenProps) {
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [choice, setChoice] = useState<ReminderChoice | null>(null);

  const load = useCallback(async () => {
    const loaded = await actions.load();
    setPermission(loaded.permission);
    setChoice(loaded.reminder);
  }, [actions]);
  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (next: ReminderChoice) => {
    setChoice(next);
    try {
      await actions.save(next);
    } catch (error) {
      console.error('The reminder could not be saved.', error);
      await load();
    }
  };

  const toggle = async (on: boolean) => {
    if (!choice) return;
    if (on && permission !== 'granted') {
      const state = await actions.request();
      setPermission(state);
      if (state !== 'granted') return;
    }
    await apply({ ...choice, enabled: on });
  };

  const denied = permission === 'denied';
  const ready = choice !== null && permission !== null;
  const time = choice ? `${two(choice.hour)}:${two(choice.minute)}` : '';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {onBack ? (
          <Pressable accessibilityRole="link" onPress={onBack} style={styles.back}>
            <Text variant="label" tone="secondary" accessibilityRole="none">
              {words.nav.today}
            </Text>
          </Pressable>
        ) : null}
        <Text variant="display34" accessibilityRole="header">
          {words.reminders.settingsTitle}
        </Text>

        {ready && choice ? (
          <>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="bodyStrong">{words.reminders.dailyQuestion}</Text>
                <Text variant="caption" tone="secondary">
                  {words.reminders.dailyQuestionHelp}
                </Text>
              </View>
              <Switch
                accessibilityLabel={words.reminders.dailyQuestion}
                value={choice.enabled && !denied}
                disabled={denied}
                onValueChange={(on) => void toggle(on)}
                trackColor={{ false: tokens.color.surface, true: tokens.color.text }}
              />
            </View>

            {denied ? (
              <View style={styles.notice}>
                <Text variant="body">{words.reminders.denied}</Text>
                <Button
                  label={words.today.openSettings}
                  variant="quiet"
                  onPress={() => actions.openSettings()}
                />
              </View>
            ) : null}

            <View style={styles.row}>
              <Text variant="body">{words.reminders.time}</Text>
              <Text variant="timecode">{time}</Text>
            </View>
            <View style={styles.pickers}>
              <Stepper
                label={words.reminders.hour}
                value={choice.hour}
                disabled={denied}
                onStep={(d) => void apply({ ...choice, hour: (choice.hour + d + 24) % 24 })}
              />
              <Stepper
                label={words.reminders.minutes}
                value={choice.minute}
                disabled={denied}
                onStep={(d) =>
                  void apply({ ...choice, minute: (choice.minute + d * MINUTE_STEP + 60) % 60 })
                }
              />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { padding: tokens.space[5], gap: tokens.space[5] },
  back: { minHeight: tokens.space[7], justifyContent: 'center', alignSelf: 'flex-start' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space[3],
    minHeight: tokens.space[7],
  },
  rowText: { flex: 1, gap: tokens.space[1] },
  notice: { gap: tokens.space[3] },
  pickers: { flexDirection: 'row', gap: tokens.space[6] },
  stepper: { gap: tokens.space[2] },
  stepRow: { flexDirection: 'row', gap: tokens.space[4] },
  step: { minHeight: tokens.space[7], justifyContent: 'center' },
});
