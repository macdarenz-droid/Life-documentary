import type { RenderManifestV1 } from '@life/contracts';
import { rgba, tokens } from '@life/design';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { px } from '../scale';

const { scrim } = tokens.color;
const caption = tokens.type.bodyStrong;

export function Captions({ captions }: { captions: RenderManifestV1['captions'] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame * 1000) / fps;
  const current = captions.find((c) => ms >= c.fromMs && ms < c.toMs);
  if (!current) return null;

  const fontSize = px(caption.size);
  const lineHeight = caption.lineHeight / caption.size;
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        backgroundImage: `linear-gradient(to bottom, ${rgba(scrim.hex, scrim.from)} 50%, ${rgba(scrim.hex, scrim.to)} 100%)`,
      }}
    >
      <div
        style={{
          marginBottom: px(tokens.space[8]) * 2,
          marginLeft: px(tokens.space[4]),
          marginRight: px(tokens.space[4]),
          padding: `${px(tokens.space[2])}px ${px(tokens.space[4])}px`,
          borderRadius: px(tokens.radius.md),
          color: tokens.color.text,
          fontFamily: caption.family,
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
