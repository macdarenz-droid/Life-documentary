import { fontFamily, rgba, tokens } from '@life/design';
import type { ReactNode } from 'react';
import { Text as NativeText, type StyleProp, type TextStyle } from 'react-native';

export type TextVariant = keyof typeof tokens.type;
export type TextTone = 'text' | 'secondary' | 'accent' | 'onAccent';

const DISPLAY_FAMILIES: readonly string[] = [fontFamily.display, fontFamily.displayItalic];

const toneColor: Record<TextTone, string> = {
  text: tokens.color.text,
  secondary: rgba(tokens.color.textSecondary.hex, tokens.color.textSecondary.alpha),
  accent: tokens.color.accent,
  onAccent: tokens.color.theatreBlack,
};

/** OS font scaling caps: display type grows less than body type. */
const MAX_SCALE_DISPLAY = 1.4;
const MAX_SCALE_BODY = 2;

export function isDisplayVariant(variant: TextVariant): boolean {
  return DISPLAY_FAMILIES.includes(tokens.type[variant].family);
}

export type TextProps = {
  variant: TextVariant;
  tone?: TextTone;
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  accessibilityRole?: 'header' | 'text' | 'none';
  nativeID?: string;
};

export function Text({
  variant,
  tone = 'text',
  children,
  style,
  accessibilityRole,
  nativeID,
}: TextProps) {
  const v: (typeof tokens.type)[TextVariant] = tokens.type[variant];
  const display = isDisplayVariant(variant);
  const base: TextStyle = {
    fontFamily: v.family,
    fontSize: v.size,
    lineHeight: v.lineHeight,
    letterSpacing: v.letterSpacing,
    color: toneColor[tone],
    ...('textTransform' in v ? { textTransform: v.textTransform } : {}),
    ...('fontVariant' in v ? { fontVariant: [...v.fontVariant] } : {}),
  };
  return (
    <NativeText
      nativeID={nativeID}
      accessibilityRole={accessibilityRole ?? (display ? 'header' : 'text')}
      maxFontSizeMultiplier={display ? MAX_SCALE_DISPLAY : MAX_SCALE_BODY}
      style={[base, style]}
    >
      {children}
    </NativeText>
  );
}
