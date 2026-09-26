import { tokens } from '@life/design';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { px } from '../scale';

/** Generated stand-in for a phone video: a moving gradient and a large frame counter. */
export function FixtureClip() {
  const frame = useCurrentFrame();
  const { durationInFrames, height } = useVideoConfig();
  const angle = interpolate(frame, [0, durationInFrames], [0, 360]);
  const y = interpolate(frame, [0, durationInFrames], [height * 0.2, height * 0.7]);
  const { velvet, filmAmber, projectorCyan, screenWhite } = tokens.color;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${angle}deg, ${velvet}, ${filmAmber} 50%, ${projectorCyan})`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: y,
          width: '100%',
          textAlign: 'center',
          fontFamily: 'sans-serif',
          fontSize: px(tokens.font.size.display) * 3,
          color: screenWhite,
        }}
      >
        {frame}
      </div>
    </AbsoluteFill>
  );
}
