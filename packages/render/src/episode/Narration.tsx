import type { RenderManifestV1 } from '@life/contracts';
import { msToFrames } from '@life/story';
import { Audio, Sequence, useVideoConfig } from 'remotion';
import { resolveSrc } from '../resolveSrc';

export function Narration({ narration }: { narration: RenderManifestV1['narration'] }) {
  const { fps } = useVideoConfig();
  return (
    <>
      {narration.map((item, i) => (
        <Sequence
          key={i}
          from={msToFrames(item.atMs, fps)}
          durationInFrames={msToFrames(item.durationMs, fps)}
          name={`Narration ${i + 1}`}
          layout="none"
        >
          <Audio src={resolveSrc(item.src)} />
        </Sequence>
      ))}
    </>
  );
}
