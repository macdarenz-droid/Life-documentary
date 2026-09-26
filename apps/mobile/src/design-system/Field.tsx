import { rgba, tokens } from '@life/design';
import { useEffect, useId, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from './Text';

export type FieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  error?: string;
};

const ringEasing = Easing.bezier(...tokens.motion.ease.out);

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  error,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const focus = useSharedValue(0);
  const labelId = useId();

  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, {
      duration: tokens.motion.duration.micro,
      easing: ringEasing,
    });
  }, [focused, focus]);

  // Colour only: the ring is always there and turns from the surface colour to the focus colour.
  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [tokens.color.surface, tokens.color.focus]),
  }));

  return (
    <View style={styles.container}>
      <Text variant="label" tone="secondary" nativeID={labelId}>
        {label}
      </Text>
      <Animated.View style={[styles.ring, ringStyle]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityLabelledBy={labelId}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={rgba(tokens.color.ash.hex, tokens.color.ash.alpha)}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, multiline && styles.multiline]}
        />
      </Animated.View>
      {error ? <Text variant="caption">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.space[2] },
  ring: {
    borderWidth: tokens.border.ring,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
  },
  input: {
    minHeight: tokens.space[7],
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    color: tokens.color.text,
    fontFamily: tokens.type.body.family,
    fontSize: tokens.type.body.size,
    lineHeight: tokens.type.body.lineHeight,
  },
  multiline: { minHeight: tokens.space[8] + tokens.space[7], textAlignVertical: 'top' },
});
