import type { RenderManifestV1 } from '@life/contracts';
import { tokens } from '@life/design';
import { AbsoluteFill } from 'remotion';
import { px } from '../scale';

export function ClosingCard({
  closing,
  credit,
}: {
  closing: RenderManifestV1['closing'];
  credit: RenderManifestV1['credit'];
}) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.color.background,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ color: tokens.color.text, fontSize: px(tokens.font.size.title) }}>
        {closing.text}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: px(tokens.space[8]),
          color: tokens.color.text,
          fontSize: px(tokens.font.size.caption),
        }}
      >
        {credit}
      </div>
    </AbsoluteFill>
  );
}
