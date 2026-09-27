// Apple's own Sign in with Apple button, black, as Apple's guidelines require.
import { tokens } from '@life/design';
import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet } from 'react-native';
import type { AppleButtonProps } from '../../domain/capturePorts';

export function AppleSignInButton({ onPress }: AppleButtonProps) {
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={tokens.radius.md}
      onPress={onPress}
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({ button: { height: tokens.space[7] } });
