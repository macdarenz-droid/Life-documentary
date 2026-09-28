import type { RenderManifestV2 } from '@life/contracts';
import { tokens } from '@life/design';
import { AbsoluteFill } from 'remotion';
import { px } from '../scale';
import { DimmedBackground } from './Media';

type Closing = Extract<RenderManifestV2['segments'][number], { kind: 'closing' }>;

/** The closing line and the "AI-narrated" credit over the dimmed closing moment. */
export function ClosingCard({
  closing,
  reducedMotion,
}: {
  closing: Closing;
  reducedMotion: boolean;
}) {
  return (
    <AbsoluteFill style={{ backgroundColor: tokens.color.background }}>
      {closing.background ? (
        <DimmedBackground background={closing.background} reducedMotion={reducedMotion} />
      ) : null}
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: tokens.type.body.family,
          textAlign: 'center',
        }}
      >
        <div style={{ color: tokens.color.text, fontSize: px(tokens.type.body.size) }}>
          {closing.text}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: px(tokens.space[8]),
            color: tokens.color.text,
            fontSize: px(tokens.type.caption.size),
          }}
        >
          {closing.credit}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
