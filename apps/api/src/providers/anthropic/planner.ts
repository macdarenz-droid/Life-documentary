// Plans through Anthropic's Messages API (P13, D39). One call with the model, limit, effort, system text
// and turns it is given: the system text as one block cached for an hour, and the output held to the
// shape of `PlannerOutput`. It reports the text, the stop reason and the token counts, and parses nothing.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages';
import { PlannerOutput } from '@life/contracts';
import type { Planner } from '../../pipeline/ports';

/** The part of the SDK's Messages API this adapter uses. */
export type MessagesApi = {
  create(params: MessageCreateParamsNonStreaming): Promise<Message>;
};

export function anthropicMessages(apiKey: string): MessagesApi {
  return new Anthropic({ apiKey }).messages;
}

export function anthropicPlanner(messages: MessagesApi): Planner {
  return {
    async plan({ model, system, messages: turns, effort, maxTokens }) {
      const message = await messages.create({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
        messages: turns.map(({ role, text }) => ({ role, content: text })),
        output_config: { effort, format: zodOutputFormat(PlannerOutput) },
      });
      const block = message.content.find((b) => b.type === 'text');
      const { usage } = message;
      return {
        ...(block?.type === 'text' ? { text: block.text } : {}),
        stopReason: message.stop_reason ?? '',
        usage: {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}
