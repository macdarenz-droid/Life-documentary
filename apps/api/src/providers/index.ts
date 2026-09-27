// The providers the Worker uses (P12, D38). Fixtures only when the `PROVIDERS` var says `fixture` (the
// test pool and local dev); otherwise the real adapters. Without their keys the captioner, the planner
// and the narrator fail at their first call instead of inventing anything (rule 10).
import type { Captioner, Narrator, PipelineProviders, Planner } from '../pipeline/ports';
import type { Env } from '../shared/env';
import { anthropicBatches, anthropicCaptioner } from './anthropic/captioner';
import { anthropicMessages, anthropicPlanner } from './anthropic/planner';
import { elevenlabsNarrator } from './elevenlabs/narrator';
import { fixtures } from './fixture';
import { workersAiTranscriber } from './workersAi/transcriber';

export const CAPTIONING_NOT_SET_UP = 'Captioning is not set up';
export const PLANNING_NOT_SET_UP = 'Planning is not set up';
export const NARRATION_NOT_SET_UP = 'Narration is not set up';

const narrationNotSetUp: Narrator = {
  speak: () => Promise.reject(new Error(NARRATION_NOT_SET_UP)),
};

const planningNotSetUp: Planner = {
  plan: () => Promise.reject(new Error(PLANNING_NOT_SET_UP)),
};

function notSetUp(): Captioner {
  const fail = (): Promise<never> => Promise.reject(new Error(CAPTIONING_NOT_SET_UP));
  return {
    submit: fail,
    status: fail,
    results: () => ({ [Symbol.asyncIterator]: () => ({ next: fail }) }),
    cancel: fail,
    remove: fail,
  };
}

export function pipelineProviders(env: Env): PipelineProviders {
  if (env.PROVIDERS === 'fixture') return fixtures;
  return {
    transcriber: workersAiTranscriber(env.AI),
    captioner: env.ANTHROPIC_API_KEY
      ? anthropicCaptioner(anthropicBatches(env.ANTHROPIC_API_KEY))
      : notSetUp(),
    planner: env.ANTHROPIC_API_KEY
      ? anthropicPlanner(anthropicMessages(env.ANTHROPIC_API_KEY))
      : planningNotSetUp,
    narrator: env.ELEVENLABS_API_KEY
      ? elevenlabsNarrator(env.ELEVENLABS_API_KEY)
      : narrationNotSetUp,
  };
}
