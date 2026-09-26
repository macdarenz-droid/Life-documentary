import { tokens } from '@life/design';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export function Surface({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.space[4],
  },
});
