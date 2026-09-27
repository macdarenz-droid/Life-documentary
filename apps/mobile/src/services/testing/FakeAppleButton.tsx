// A stand-in for Apple's native button in tests and the Design Lab.
import { words } from '@life/story';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { AppleButtonProps } from '../../domain/capturePorts';

export function FakeAppleButton({ onPress }: AppleButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.account.signInApple}
      onPress={onPress}
      style={styles.button}
    >
      <Text style={styles.label}>{words.account.signInApple}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#000',
    borderRadius: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#fff', fontWeight: '600' },
});
