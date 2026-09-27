// A labelled on/off row. The Switch is the control; the explanation is read with it.
import { tokens } from '@life/design';
import { StyleSheet, View } from 'react-native';
import { Switch, Text } from '../../../design-system';

export function Toggle({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="body" accessibilityRole="none">
          {label}
        </Text>
        {help ? (
          <Text variant="caption" tone="secondary" accessibilityRole="none">
            {help}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={help}
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[4] },
  text: { flex: 1, gap: tokens.space[1] },
});
