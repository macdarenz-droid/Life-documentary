import type { RenderManifestV1 } from '@life/contracts';
import { tokens } from '@life/design';
import { msToFrames } from '@life/story';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { px } from '../scale';

type Item = RenderManifestV1['lowerThirds'][number];

export function LowerThird({ item, reducedMotion }: { item: Item; reducedMotion: boolean }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const slide = Math.max(1, msToFrames(tokens.motion.durationMs.base, fps));
  const offset = reducedMotion
    ? 0
    : interpolate(
        frame,
        [0, slide, durationInFrames - slide, durationInFrames],
        [-width, 0, 0, -width],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      );

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
      <div
        style={{
          transform: `translateX(${offset}px)`,
          alignSelf: 'flex-start',
          marginLeft: px(tokens.space[4]),
          marginBottom: px(tokens.space[8]) * 4,
          padding: `${px(tokens.space[2])}px ${px(tokens.space[4])}px`,
          backgroundColor: tokens.color.surface,
          borderLeft: `${px(tokens.space[1])}px solid ${tokens.color.accent}`,
          fontFamily: 'sans-serif',
        }}
      >
        <span style={{ color: tokens.color.text, fontSize: px(tokens.font.size.title) }}>
          {item.name}
        </span>
        {item.relation ? (
          <span style={{ color: tokens.color.accent, fontSize: px(tokens.font.size.body) }}>
            {' · '}
            {item.relation}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
