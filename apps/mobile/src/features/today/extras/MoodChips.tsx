// The five moods the person may choose; optional. One tap selects, a second tap clears. Never inferred.
import type { MomentMood } from '@life/contracts';
import { rgba, tokens } from '@life/design';
import { words } from '@life/story';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../design-system';

const MOODS: readonly MomentMood[] = ['bright', 'calm', 'tender', 'tired', 'heavy'];

export function MoodChips({
  value,
  onChange,
}: {
  value: MomentMood | null;
  onChange: (m: MomentMood | null) => void;
}) {
  return (
    <View style={styles.row} accessibilityLabel={words.extras.moodLabel}>
      {MOODS.map((mood) => {
        const selected = value === mood;
        return (
          <Pressable
            key={mood}
            accessibilityRole="button"
            accessibilityLabel={words.moods[mood]}
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : mood)}
            style={[styles.chip, selected && styles.selected]}
          >
            <Text variant="caption" tone={selected ? 'text' : 'secondary'} accessibilityRole="none">
              {words.moods[mood]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: tokens.space[2] },
  chip: {
    minHeight: tokens.space[7],
    justifyContent: 'center',
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.lg,
    borderWidth: tokens.border.outline,
    borderColor: rgba(tokens.color.ash.hex, tokens.color.ash.alpha),
  },
  selected: { borderColor: tokens.color.text },
});
