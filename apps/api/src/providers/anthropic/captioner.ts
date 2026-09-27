// Captions through Anthropic's Message Batches API (D38). Each item becomes one request with the model,
// limit, system text and user text it is given, and its image as a base64 JPEG. Results are reported as
// they came back, in any order; which captions are kept is the pipeline's decision.
import Anthropic from '@anthropic-ai/sdk';
import type {
  BatchCreateParams,
  MessageBatchIndividualResponse,
} from '@anthropic-ai/sdk/resources/messages/batches';
import type { CaptionResult, Captioner } from '../../pipeline/ports';

/** The part of the SDK's batch API this adapter uses. */
export type BatchApi = {
  create(params: BatchCreateParams): Promise<{ id: string }>;
  retrieve(id: string): Promise<{ processing_status: 'in_progress' | 'canceling' | 'ended' }>;
  results(id: string): Promise<AsyncIterable<MessageBatchIndividualResponse>>;
  cancel(id: string): Promise<unknown>;
  delete(id: string): Promise<unknown>;
};

export function anthropicBatches(apiKey: string): BatchApi {
  return new Anthropic({ apiKey }).messages.batches;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
}

function toResult({ custom_id: id, result }: MessageBatchIndividualResponse): CaptionResult {
  if (result.type !== 'succeeded') {
    return { id, outcome: result.type, inputTokens: 0, outputTokens: 0 };
  }
  const { message } = result;
  const text = message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('');
  return {
    id,
    outcome: 'succeeded',
    text,
    ...(message.stop_reason ? { stopReason: message.stop_reason } : {}),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}

export function anthropicCaptioner(batches: BatchApi): Captioner {
  return {
    async submit(items, { model, system, userText, maxTokens }) {
      const batch = await batches.create({
        requests: items.map((item) => ({
          custom_id: item.id,
          params: {
            model,
            max_tokens: maxTokens,
            system,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/jpeg', data: item.jpegBase64 },
                  },
                  { type: 'text', text: userText },
                ],
              },
            ],
          },
        })),
      });
      return batch.id;
    },
    async status(batchId) {
      return (await batches.retrieve(batchId)).processing_status;
    },
    async *results(batchId) {
      for await (const entry of await batches.results(batchId)) yield toResult(entry);
    },
    async cancel(batchId) {
      await batches.cancel(batchId);
    },
    async remove(batchId) {
      try {
        await batches.delete(batchId);
      } catch (error) {
        // Already deleted: a retried delete completes.
        if (!isNotFound(error)) throw error;
      }
    },
  };
}
