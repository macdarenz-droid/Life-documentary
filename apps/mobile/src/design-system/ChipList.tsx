// A wrapping row of chips, multi-select: one tap selects, a second tap clears. Values in, onChange out.
import { rgba, tokens } from '@life/design';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

export type ChipOption<Id extends string = string> = { id: Id; label: string };

export type ChipListProps<Id extends string = string> = {
  options: readonly ChipOption<Id>[];
  selected: readonly Id[];
  onChange: (selected: Id[]) => void;
};

export function ChipList<Id extends string>({ options, selected, onChange }: ChipListProps<Id>) {
  return (
    <View style={styles.row}>
      {options.map(({ id, label }) => {
        const on = selected.includes(id);
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(on ? selected.filter((x) => x !== id) : [...selected, id])}
            style={[styles.chip, on && styles.selected]}
          >
            <Text variant="caption" tone={on ? 'text' : 'secondary'} accessibilityRole="none">
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] },
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
