import { tokens } from '@life/design';
import { StyleSheet, Text, View } from 'react-native';

export function TodayPlaceholder() {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.heading}>
        Life Documentary
      </Text>
      <Text style={styles.line}>Your first question arrives soon.</Text>
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
  heading: {
    fontSize: tokens.type.display34.size,
    color: tokens.color.text,
    textAlign: 'center',
  },
  line: {
    marginTop: tokens.space[3],
    fontSize: tokens.type.body.size,
    color: tokens.color.accent,
    textAlign: 'center',
  },
});
