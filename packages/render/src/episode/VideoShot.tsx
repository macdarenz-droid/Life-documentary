import { msToFrames } from '@life/story';
import { AbsoluteFill, OffthreadVideo, useVideoConfig } from 'remotion';
import type { RenderManifestV1 } from '@life/contracts';
import { resolveSrc } from '../resolveSrc';

type Video = Extract<RenderManifestV1['shots'][number], { kind: 'video' }>;

export function VideoShot({ shot }: { shot: Video }) {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={resolveSrc(shot.src)}
        trimBefore={msToFrames(shot.inMs, fps)}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
}
