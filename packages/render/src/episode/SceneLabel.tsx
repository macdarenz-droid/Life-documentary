import { tokens } from '@life/design';
import { AbsoluteFill } from 'remotion';
import { px } from '../scale';
import { Label } from './Label';

/** A scene's heading over its first shot when it has no bridge slot. */
export function SceneLabel({ text }: { text: string }) {
  return (
    <AbsoluteFill style={{ padding: px(tokens.space[6]), paddingTop: px(tokens.space[8]) * 2 }}>
      <Label text={text} />
    </AbsoluteFill>
  );
}
