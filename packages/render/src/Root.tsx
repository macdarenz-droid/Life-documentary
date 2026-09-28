import { RenderManifestV2 } from '@life/contracts';
import { fixtureManifest, msToFrames } from '@life/story';
import { Composition, Still } from 'remotion';
import { Episode } from './episode/Episode';
import { FixtureAnswer } from './fixtures/FixtureAnswer';
import { FixtureClip } from './fixtures/FixtureClip';
import { FixturePhoto } from './fixtures/FixturePhoto';

const FPS = 30;
/** The fixture media is portrait, like a phone's. */
const FIXTURE_WIDTH = 1080;
const FIXTURE_HEIGHT = 1920;
/** A fixture answer plays 4 s. */
const ANSWER_SECONDS = 4;
const fixture = fixtureManifest();

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="Episode"
        component={Episode}
        schema={RenderManifestV2}
        defaultProps={fixture}
        width={fixture.format.width}
        height={fixture.format.height}
        fps={FPS}
        durationInFrames={msToFrames(fixture.durationMs, FPS)}
        calculateMetadata={({ props }) => ({
          durationInFrames: msToFrames(props.durationMs, FPS),
          width: props.format.width,
          height: props.format.height,
          fps: FPS,
        })}
      />
      <Composition
        id="FixtureClip"
        component={FixtureClip}
        width={FIXTURE_WIDTH}
        height={FIXTURE_HEIGHT}
        fps={FPS}
        durationInFrames={3 * FPS}
      />
      <Composition
        id="FixtureAnswer"
        component={FixtureAnswer}
        width={FIXTURE_WIDTH}
        height={FIXTURE_HEIGHT}
        fps={FPS}
        durationInFrames={ANSWER_SECONDS * FPS}
      />
      <Still
        id="FixturePhoto"
        component={FixturePhoto}
        width={FIXTURE_WIDTH}
        height={FIXTURE_HEIGHT}
      />
    </>
  );
}
