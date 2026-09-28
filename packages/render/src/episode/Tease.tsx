import type { RenderManifestV2 } from '@life/contracts';
import { tokens } from '@life/design';
import { AbsoluteFill } from 'remotion';
import { px } from '../scale';
import { Label } from './Label';

type TeaseSegment = Extract<RenderManifestV2['segments'][number], { kind: 'tease' }>;

/** "Next week" and the storyline it points to, while the narrator speaks the tease. */
export function Tease({ segment }: { segment: TeaseSegment }) {
  const display = tokens.type.display48;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.color.background,
        justifyContent: 'center',
        padding: px(tokens.space[6]),
      }}
    >
      <Label text={segment.label} />
      {segment.storyline ? (
        <div
          style={{
            marginTop: px(tokens.space[4]),
            fontFamily: display.family,
            fontSize: px(display.size),
            lineHeight: `${px(display.lineHeight)}px`,
            color: tokens.color.text,
          }}
        >
          {segment.storyline}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
