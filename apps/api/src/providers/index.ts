// The providers the Worker uses (P12, D38). Fixtures only when the `PROVIDERS` var says `fixture` (the
// test pool and local dev); otherwise the real adapters. Without the Anthropic key the captioner and the
// planner fail at their first call instead of inventing text (rule 10).
import type { Captioner, PipelineProviders, Planner } from '../pipeline/ports';
import type { Env } from '../shared/env';
import { anthropicBatches, anthropicCaptioner } from './anthropic/captioner';
import { anthropicMessages, anthropicPlanner } from './anthropic/planner';
import { fixtures } from './fixture';
import { workersAiTranscriber } from './workersAi/transcriber';

export const CAPTIONING_NOT_SET_UP = 'Captioning is not set up';
export const PLANNING_NOT_SET_UP = 'Planning is not set up';

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
  };
}
