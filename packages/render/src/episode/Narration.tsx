import type { RenderManifestV2 } from '@life/contracts';
import { msToFrames } from '@life/story';
import { Html5Audio, Sequence, useVideoConfig } from 'remotion';
import { resolveSrc } from '../resolveSrc';

export function Narration({ narration }: { narration: RenderManifestV2['narration'] }) {
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
          <Html5Audio src={resolveSrc(item.src)} volume={1} />
        </Sequence>
      ))}
    </>
  );
}
