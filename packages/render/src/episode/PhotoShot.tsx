import type { RenderManifestV1 } from '@life/contracts';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveSrc } from '../resolveSrc';

type Photo = Extract<RenderManifestV1['shots'][number], { kind: 'photo' }>;

export function PhotoShot({ shot }: { shot: Photo }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const from = shot.kenBurns?.fromScale ?? 1;
  const to = shot.kenBurns?.toScale ?? 1;
  const scale = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={resolveSrc(shot.src)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
}
