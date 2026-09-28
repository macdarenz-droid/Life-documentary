import type { RenderManifestV2 } from '@life/contracts';
import { tokens } from '@life/design';
import { msToFrames } from '@life/story';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { px } from '../scale';

/** In 9:16 the lower third sits well clear of the caption box; in 16:9 in the lower quarter, above the captions. */
const PORTRAIT_BOTTOM = 0.4;
const LANDSCAPE_BOTTOM = 0.25;

/** Pixels from the bottom of the frame to the bottom of the lower third. */
export function lowerThirdBottomPx(width: number, height: number): number {
  return height * (height > width ? PORTRAIT_BOTTOM : LANDSCAPE_BOTTOM);
}

type Item = RenderManifestV2['lowerThirds'][number];

export function LowerThird({ item, reducedMotion }: { item: Item; reducedMotion: boolean }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const slide = Math.max(1, msToFrames(tokens.motion.duration.ui, fps));
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
          marginBottom: lowerThirdBottomPx(width, height),
          padding: `${px(tokens.space[2])}px ${px(tokens.space[4])}px`,
          backgroundColor: tokens.color.surface,
          borderLeft: `${px(tokens.space[1])}px solid ${tokens.color.accent}`,
          fontFamily: tokens.type.body.family,
        }}
      >
        <span style={{ color: tokens.color.text, fontSize: px(tokens.type.body.size) }}>
          {item.name}
        </span>
        {item.relation ? (
          <span style={{ color: tokens.color.accent, fontSize: px(tokens.type.body.size) }}>
            {' · '}
            {item.relation}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
