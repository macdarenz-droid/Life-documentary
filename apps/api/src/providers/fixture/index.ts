// The fixture providers the Worker uses when its `PROVIDERS` var is `fixture` (the test pool and local
// dev). One shared set, so a test can set answers on the providers the pipeline will use.
import type { PipelineProviders } from '../../pipeline/ports';
import { fixtureCaptioner, type FixtureCaptioner } from './captioner';
import { fixtureNarrator, type FixtureNarrator } from './narrator';
import { fixturePlanner, type FixturePlanner } from './planner';
import { fixtureTranscriber, type FixtureTranscriber } from './transcriber';

export {
  fixtureCaptioner,
  fixtureNarrator,
  fixturePlanner,
  fixtureTranscriber,
  type FixtureCaptioner,
  type FixtureNarrator,
  type FixturePlanner,
  type FixtureTranscriber,
};

export const fixtures: PipelineProviders & {
  transcriber: FixtureTranscriber;
  captioner: FixtureCaptioner;
  planner: FixturePlanner;
  narrator: FixtureNarrator;
  reset(): void;
} = {
  transcriber: fixtureTranscriber(),
  captioner: fixtureCaptioner(),
  planner: fixturePlanner(),
  narrator: fixtureNarrator(),
  reset() {
    fixtures.transcriber.reset();
    fixtures.captioner.reset();
    fixtures.planner.reset();
    fixtures.narrator.reset();
  },
};
