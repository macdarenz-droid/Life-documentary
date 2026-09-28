// The fixture providers the Worker uses when its `PROVIDERS` var is `fixture` (the test pool and local
// dev). One shared set, so a test can set answers on the providers the pipeline will use.
import type { PipelineProviders } from '../../pipeline/ports';
import { fixtureCaptioner, type FixtureCaptioner } from './captioner';
import { fixtureNarrator, type FixtureNarrator } from './narrator';
import { fixturePlanner, type FixturePlanner } from './planner';
import { fixturePusher, type FixturePusher } from './pusher';
import { fixtureRenderer, type FixtureRenderer } from './renderer';
import { fixtureTranscriber, type FixtureTranscriber } from './transcriber';

export {
  fixtureCaptioner,
  fixtureNarrator,
  fixturePlanner,
  fixturePusher,
  fixtureRenderer,
  fixtureTranscriber,
  type FixtureCaptioner,
  type FixtureNarrator,
  type FixturePlanner,
  type FixturePusher,
  type FixtureRenderer,
  type FixtureTranscriber,
};

export const fixtures: PipelineProviders & {
  transcriber: FixtureTranscriber;
  captioner: FixtureCaptioner;
  planner: FixturePlanner;
  narrator: FixtureNarrator;
  renderer: FixtureRenderer;
  pusher: FixturePusher;
  reset(): void;
} = {
  transcriber: fixtureTranscriber(),
  captioner: fixtureCaptioner(),
  planner: fixturePlanner(),
  narrator: fixtureNarrator(),
  renderer: fixtureRenderer(),
  pusher: fixturePusher(),
  reset() {
    fixtures.transcriber.reset();
    fixtures.captioner.reset();
    fixtures.planner.reset();
    fixtures.narrator.reset();
    fixtures.renderer.reset();
    fixtures.pusher.reset();
  },
};
