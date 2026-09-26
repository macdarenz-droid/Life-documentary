import type { RenderManifestV1 } from '@life/contracts';
import { musicVolumeAt } from '@life/story';
import { Audio, useVideoConfig } from 'remotion';
import { resolveSrc } from '../resolveSrc';

export function Music({ manifest }: { manifest: RenderManifestV1 }) {
  const { fps } = useVideoConfig();
  if (!manifest.music) return null;
  return (
    <Audio
      src={resolveSrc(manifest.music.src)}
      volume={(f) => musicVolumeAt((f * 1000) / fps, manifest)}
    />
  );
}
