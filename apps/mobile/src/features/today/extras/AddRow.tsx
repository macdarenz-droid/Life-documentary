// The quiet row under the Record button: four text buttons, no icons.
import { tokens } from '@life/design';
import { words } from '@life/story';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../design-system';

export type AddAction = 'photo' | 'library' | 'note' | 'place';

const LABELS: Record<AddAction, string> = {
  photo: words.extras.photo,
  library: words.extras.fromLibrary,
  note: words.extras.note,
  place: words.extras.place,
};

export function AddRow({
  onAction,
  disabled = [],
}: {
  onAction: (a: AddAction) => void;
  disabled?: AddAction[];
}) {
  return (
    <View style={styles.row}>
      {(Object.keys(LABELS) as AddAction[]).map((action) => {
        const off = disabled.includes(action);
        return (
          <Pressable
            key={action}
            accessibilityRole="button"
            accessibilityLabel={LABELS[action]}
            accessibilityState={{ disabled: off }}
            disabled={off}
            onPress={() => onAction(action)}
            style={styles.item}
          >
            <Text variant="caption" tone={off ? 'secondary' : 'text'} accessibilityRole="none">
              {LABELS[action]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: tokens.space[4] },
  item: {
    minHeight: tokens.space[7],
    justifyContent: 'center',
    paddingHorizontal: tokens.space[2],
  },
});
