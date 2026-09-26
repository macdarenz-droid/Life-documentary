import { ImpactFeedbackStyle, impactAsync, selectionAsync } from 'expo-haptics';
import type { Haptics } from '../../domain/capturePorts';

export const expoHaptics: Haptics = {
  impactLight: () => void impactAsync(ImpactFeedbackStyle.Light),
  selection: () => void selectionAsync(),
};
