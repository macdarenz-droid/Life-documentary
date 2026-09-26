// The amber ring of Record: a Skia arc whose end follows a shared progress value (0 → 1).
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { tokens } from '@life/design';
import { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';

const STROKE = 4;

export type RecordRingProps = { progress: SharedValue<number>; size: number };

export function RecordRing({ progress, size }: RecordRingProps) {
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
        end={progress}
      />
    </Canvas>
  );
}
