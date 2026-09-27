// The fixture providers the Worker uses when its `PROVIDERS` var is `fixture` (the test pool and local
// dev). One shared set, so a test can set answers on the providers the pipeline will use.
import type { PipelineProviders } from '../../pipeline/ports';
import { fixtureCaptioner, type FixtureCaptioner } from './captioner';
import { fixtureTranscriber, type FixtureTranscriber } from './transcriber';

export { fixtureCaptioner, fixtureTranscriber, type FixtureCaptioner, type FixtureTranscriber };

export const fixtures: PipelineProviders & {
  transcriber: FixtureTranscriber;
  captioner: FixtureCaptioner;
  reset(): void;
} = {
  transcriber: fixtureTranscriber(),
  captioner: fixtureCaptioner(),
  reset() {
    fixtures.transcriber.reset();
    fixtures.captioner.reset();
  },
};
