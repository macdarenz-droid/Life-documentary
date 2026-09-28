import type { RenderManifestV2 } from '@life/contracts';
import { tokens } from '@life/design';
import { AbsoluteFill } from 'remotion';
import { px } from '../scale';
import { Label } from './Label';
import { DimmedBackground } from './Media';

type SceneOpenSegment = Extract<RenderManifestV2['segments'][number], { kind: 'sceneOpen' }>;

/** A bridge slot: the scene's heading over its dimmed background while the narrator speaks. */
export function SceneOpen({
  segment,
  reducedMotion,
}: {
  segment: SceneOpenSegment;
  reducedMotion: boolean;
}) {
  return (
    <AbsoluteFill style={{ backgroundColor: tokens.color.background }}>
      {segment.background ? (
        <DimmedBackground background={segment.background} reducedMotion={reducedMotion} />
      ) : null}
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'center', padding: px(tokens.space[6]) }}
      >
        <Label text={segment.heading} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
