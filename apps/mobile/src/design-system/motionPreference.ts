import { tokens } from '@life/design';
import { useReducedMotion } from 'react-native-reanimated';

export type SpatialSpring = {
  readonly mass: number;
  readonly stiffness: number;
  readonly damping: number;
};
export type FadeMotion = { readonly kind: 'fade'; readonly ms: number };

/** The one source of the reduced-motion preference for every animated component. */
export function useMotionPreference(): { reduced: boolean } {
  return { reduced: useReducedMotion() };
}

/** A spatial spring, or its reduced-motion equivalent: a short fade. */
export function pickMotion(reduced: boolean, spatial: SpatialSpring): SpatialSpring | FadeMotion {
  return reduced ? { kind: 'fade', ms: tokens.motion.reducedMotion.fadeMs } : spatial;
}
