import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages';
import { voiceBannedCharacters } from '@life/story';
import { describe, expect, it } from 'vitest';
import { STYLE_PROMPT } from '../src/pipeline/plan/stylePrompt';
import type { PlanRequest } from '../src/pipeline/ports';
import { planCostRows } from '../src/policy/costs';
import { PLANNING_NOT_SET_UP, pipelineProviders } from '../src/providers';
import { anthropicPlanner, type MessagesApi } from '../src/providers/anthropic/planner';
import { fixtures } from '../src/providers/fixture';
import { NO_FIXTURE_ANSWER } from '../src/providers/fixture/planner';
import type { Env } from '../src/shared/env';
import { bindings } from './session';

const request: PlanRequest = {
  model: 'claude-sonnet-5',
  system: 'The style prompt.',
  messages: [
    { role: 'user', text: '{"brief":1}' },
    { role: 'assistant', text: '{"title":""}' },
    { role: 'user', text: 'title: too_small' },
  ],
  effort: 'medium',
  maxTokens: 16000,
};

function stub(content: Message['content'], usage: Partial<Message['usage']> = {}) {
  const calls: MessageCreateParamsNonStreaming[] = [];
  const api: MessagesApi = {
    create: (params) => {
      calls.push(params);
      return Promise.resolve({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content,
        stop_reason: 'end_turn',
        stop_sequence: null,
        container: null,
        usage: {
          input_tokens: 1800,
          output_tokens: 250,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: 1300,
          ...usage,
        },
      } as unknown as Message);
    },
  };
  return { api, calls };
}

const PLANNER_KEYS = [
  'title',
  'subtitle',
  'coldOpen',
  'scenes',
  'closing',
  'tease',
  'musicMood',
  'lowerThirds',
  'summary',
];

describe('the Anthropic planner', () => {
  it('makes one call with the model, limit, effort, cached system block, turns and format', async () => {
    const { api, calls } = stub([{ type: 'text', text: '{"title":"Rain"}', citations: null }]);
    const answer = await anthropicPlanner(api).plan(request);
    expect(calls).toHaveLength(1);
    const [params] = calls;
    expect(params).toMatchObject({
      model: 'claude-sonnet-5',
      max_tokens: 16000,
      system: [
        {
          type: 'text',
          text: 'The style prompt.',
          cache_control: { type: 'ephemeral', ttl: '1h' },
        },
      ],
      messages: [
        { role: 'user', content: '{"brief":1}' },
        { role: 'assistant', content: '{"title":""}' },
        { role: 'user', content: 'title: too_small' },
      ],
    });
    expect(params?.output_config?.effort).toBe('medium');
    const format = params?.output_config?.format;
    expect(format?.type).toBe('json_schema');
    const schema = format?.schema as {
      type: string;
      additionalProperties: boolean;
      properties: Record<string, unknown>;
    };
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual([...PLANNER_KEYS].sort());
    expect(answer).toEqual({
      text: '{"title":"Rain"}',
      stopReason: 'end_turn',
      usage: { inputTokens: 1800, outputTokens: 250, cacheWriteTokens: 0, cacheReadTokens: 1300 },
    });
  });

  it('gives no text when the answer has no text block', async () => {
    const { api } = stub([{ type: 'thinking', thinking: '', signature: 's' }], {
      cache_read_input_tokens: null,
    });
    const answer = await anthropicPlanner(api).plan(request);
    expect(answer).not.toHaveProperty('text');
    expect(answer.usage).toEqual({
      inputTokens: 1800,
      outputTokens: 250,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
  });
});

describe('the planner providers', () => {
  it('fail without a key instead of answering', async () => {
    const real: Env = { ...bindings };
    delete real.PROVIDERS;
    delete real.ANTHROPIC_API_KEY;
    await expect(pipelineProviders(real).planner.plan(request)).rejects.toThrow(
      PLANNING_NOT_SET_UP,
    );
    expect(PLANNING_NOT_SET_UP).toBe('Planning is not set up');
  });

  it('give the fixture planner only when PROVIDERS is fixture', () => {
    expect(pipelineProviders(bindings).planner).toBe(fixtures.planner);
    const real: Env = { ...bindings, ANTHROPIC_API_KEY: 'test-key-not-real' };
    delete real.PROVIDERS;
    expect(pipelineProviders(real).planner).not.toBe(fixtures.planner);
  });

  it('the fixture records calls, gives its answers in order and throws when it runs out', async () => {
    fixtures.reset();
    const { planner } = fixtures;
    const usage = { inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0 };
    planner.answers.push(
      { text: '{}', stopReason: 'end_turn', usage },
      { stopReason: 'refusal', usage },
      new Error('Overloaded'),
    );
    expect(await planner.plan(request)).toEqual({ text: '{}', stopReason: 'end_turn', usage });
    expect(await planner.plan(request)).toEqual({ stopReason: 'refusal', usage });
    await expect(planner.plan(request)).rejects.toThrow('Overloaded');
    await expect(planner.plan(request)).rejects.toThrow(NO_FIXTURE_ANSWER);
    expect(NO_FIXTURE_ANSWER).toBe('No fixture answer');
    expect(planner.calls).toHaveLength(4);
    expect(planner.calls[0]).toEqual(request);
    fixtures.reset();
  });
});

describe('the style prompt', () => {
  it('is long enough to cache and has no banned character', () => {
    expect(STYLE_PROMPT.length).toBeGreaterThanOrEqual(4500);
    for (const char of voiceBannedCharacters) expect(STYLE_PROMPT).not.toContain(char);
  });
});

describe('planCostRows', () => {
  it('gives one rounded row per unit used, at the Sonnet 5 prices', () => {
    const rows = planCostRows({
      inputTokens: 18_000,
      outputTokens: 2500,
      cacheWriteTokens: 0,
      cacheReadTokens: 1300,
    });
    expect(rows).toEqual([
      { unit: 'inputToken', units: 18_000, microUsd: 36_000 },
      { unit: 'outputToken', units: 2500, microUsd: 25_000 },
      { unit: 'cacheReadToken', units: 1300, microUsd: 260 },
    ]);
    expect(rows.reduce((sum, r) => sum + r.microUsd, 0)).toBe(61_260);
  });
  it('rounds a fraction of a µUSD up once per row', () => {
    expect(
      planCostRows({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 7 }),
    ).toEqual([{ unit: 'cacheReadToken', units: 7, microUsd: 2 }]);
  });
});
