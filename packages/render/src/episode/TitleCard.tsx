import type { RenderManifestV1 } from '@life/contracts';
import { tokens } from '@life/design';
import { AbsoluteFill } from 'remotion';
import { px } from '../scale';

export function TitleCard({ title }: { title: RenderManifestV1['title'] }) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.color.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: px(tokens.space[6]),
        fontFamily: 'sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ color: tokens.color.text, fontSize: px(tokens.font.size.display) }}>
        {title.text}
      </div>
      {title.subtitle ? (
        <div
          style={{
            color: tokens.color.accent,
            fontSize: px(tokens.font.size.title),
            marginTop: px(tokens.space[4]),
          }}
        >
          {title.subtitle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
