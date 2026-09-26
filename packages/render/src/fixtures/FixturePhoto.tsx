import { tokens } from '@life/design';
import { AbsoluteFill } from 'remotion';
import { px } from '../scale';

/** Generated stand-in for a phone photo: shapes and a label. */
export function FixturePhoto() {
  const { velvet, filmAmber, projectorCyan, screenWhite } = tokens.color;
  return (
    <AbsoluteFill style={{ backgroundColor: velvet }}>
      <div
        style={{
          position: 'absolute',
          left: px(tokens.space[6]),
          top: px(tokens.space[8]) * 2,
          width: 600,
          height: 600,
          borderRadius: '50%',
          backgroundColor: filmAmber,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: px(tokens.space[6]),
          bottom: px(tokens.space[8]) * 3,
          width: 500,
          height: 700,
          borderRadius: px(tokens.radius.lg),
          backgroundColor: projectorCyan,
        }}
      />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            fontFamily: 'sans-serif',
            fontSize: px(tokens.font.size.display),
            color: screenWhite,
          }}
        >
          Photo fixture
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
