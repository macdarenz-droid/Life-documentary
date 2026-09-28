import type { RenderManifestV2 } from '@life/contracts';
import { musicVolumeAt } from '@life/story';
import { Html5Audio, useVideoConfig } from 'remotion';
import { resolveSrc } from '../resolveSrc';

export function Music({ manifest }: { manifest: RenderManifestV2 }) {
  const { fps } = useVideoConfig();
  if (!manifest.music) return null;
  return (
    <Html5Audio
      src={resolveSrc(manifest.music.src)}
      volume={(f) => musicVolumeAt((f * 1000) / fps, manifest)}
    />
  );
}
