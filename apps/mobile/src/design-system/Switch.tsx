// The one on/off control. Colours come only from the tokens: off is a velvet track with a white thumb,
// on is a white track with a black thumb. react-native-web reads the on colours only from
// activeThumbColor and activeTrackColor, so those are passed on web too.
import { tokens } from '@life/design';
import {
  Platform,
  Switch as NativeSwitch,
  type SwitchProps as NativeSwitchProps,
} from 'react-native';

export type SwitchProps = Omit<
  NativeSwitchProps,
  'thumbColor' | 'trackColor' | 'ios_backgroundColor'
>;

export const switchColors = {
  off: { track: tokens.color.surface, thumb: tokens.color.text },
  on: { track: tokens.color.text, thumb: tokens.color.background },
} as const;

const webOnColors =
  Platform.OS === 'web'
    ? { activeThumbColor: switchColors.on.thumb, activeTrackColor: switchColors.on.track }
    : {};

export function Switch({ value, ...props }: SwitchProps) {
  return (
    <NativeSwitch
      {...props}
      {...webOnColors}
      value={value}
      thumbColor={value ? switchColors.on.thumb : switchColors.off.thumb}
      trackColor={{ false: switchColors.off.track, true: switchColors.on.track }}
      ios_backgroundColor={switchColors.off.track}
    />
  );
}
