import { AbsoluteFill, Html5Audio, staticFile } from 'remotion';
import { FixtureClip } from './FixtureClip';

/** Generated stand-in for a video answer: the fixture clip's picture with the voice tone. */
export function FixtureAnswer() {
  return (
    <AbsoluteFill>
      <FixtureClip />
      <Html5Audio src={staticFile('fixtures/answer-voice.wav')} />
    </AbsoluteFill>
  );
}
