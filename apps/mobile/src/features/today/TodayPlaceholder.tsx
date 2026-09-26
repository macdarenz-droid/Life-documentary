import { tokens } from '@life/design';
import { words } from '@life/story';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../design-system';

export function TodayPlaceholder() {
  return (
    <View style={styles.screen}>
      <Text variant="display34" style={styles.centered}>
        {words.today.placeholderTitle}
      </Text>
      <Text variant="body" tone="accent" style={[styles.centered, styles.line]}>
        {words.today.placeholderLine}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[5],
    backgroundColor: tokens.color.background,
  },
  centered: { textAlign: 'center' },
  line: { marginTop: tokens.space[3] },
});
