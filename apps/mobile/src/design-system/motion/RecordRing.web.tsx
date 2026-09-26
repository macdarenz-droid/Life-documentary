// Web (the Design Lab): Skia's canvas on web does not follow a shared value by itself, so the progress
// is mirrored into React state each frame. Native uses RecordRing.tsx, driven on the UI thread.
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { tokens } from '@life/design';
import { useMemo, useState } from 'react';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { RecordRingProps } from './RecordRing';

const STROKE = 4;

export function RecordRing({ progress, size }: RecordRingProps) {
  const [end, setEnd] = useState(0);
  useAnimatedReaction(
    () => progress.value,
    (value) => {
      scheduleOnRN(setEnd, value);
    },
  );
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    const r = size / 2 - STROKE;
    p.addArc({ x: STROKE, y: STROKE, width: r * 2, height: r * 2 }, -90, 359.9);
    return p;
  }, [size]);
  return (
    <Canvas style={{ width: size, height: size, flexShrink: 0 }} pointerEvents="none">
      <Path
        path={path}
        style="stroke"
        strokeWidth={STROKE}
        strokeCap="round"
        color={tokens.color.accent}
        start={0}
        end={end}
      />
    </Canvas>
  );
}
