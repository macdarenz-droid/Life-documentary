import type { RenderManifestV1 } from '@life/contracts';
import { tokens } from '@life/design';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { px } from '../scale';

// Translucent band: the background colour at 75 % opacity (hex alpha BF).
const BAND_ALPHA = 'BF';

export function Captions({ captions }: { captions: RenderManifestV1['captions'] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame * 1000) / fps;
  const current = captions.find((c) => ms >= c.fromMs && ms < c.toMs);
  if (!current) return null;

  const fontSize = px(tokens.type.body.size);
  const lineHeight = 1.3;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
      <div
        style={{
          marginBottom: px(tokens.space[8]) * 2,
          marginLeft: px(tokens.space[4]),
          marginRight: px(tokens.space[4]),
          padding: `${px(tokens.space[2])}px ${px(tokens.space[4])}px`,
          borderRadius: px(tokens.radius.md),
          backgroundColor: `${tokens.color.background}${BAND_ALPHA}`,
          color: tokens.color.text,
          fontFamily: 'sans-serif',
          fontSize,
          lineHeight,
          textAlign: 'center',
          maxHeight: fontSize * lineHeight * 2 + px(tokens.space[2]) * 2,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {current.text}
      </div>
    </AbsoluteFill>
  );
}
