import { RenderManifestV1 } from '@life/contracts';
import { fixtureManifest, manifestDurationMs, msToFrames } from '@life/story';
import { Composition, Still } from 'remotion';
import { Episode } from './episode/Episode';
import { FixtureClip } from './fixtures/FixtureClip';
import { FixturePhoto } from './fixtures/FixturePhoto';

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="Episode"
        component={Episode}
        schema={RenderManifestV1}
        defaultProps={fixtureManifest()}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={msToFrames(manifestDurationMs(fixtureManifest()), FPS)}
        calculateMetadata={({ props }) => ({
          durationInFrames: msToFrames(manifestDurationMs(props), FPS),
          width: WIDTH,
          height: HEIGHT,
          fps: FPS,
        })}
      />
      <Composition
        id="FixtureClip"
        component={FixtureClip}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={3 * FPS}
      />
      <Still id="FixturePhoto" component={FixturePhoto} width={WIDTH} height={HEIGHT} />
    </>
  );
}
