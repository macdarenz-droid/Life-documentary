import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';

/**
 * What one step of an episode cost, per unit (P12): one row per episode, step and unit, in micro-dollars
 * (µUSD, integers). `renarrate` is what re-cuts spent on narration (P17).
 */
export const CostLedgerRow = z.object({
  id: Uuid,
  episodeId: Uuid,
  step: z.enum(['transcribe', 'caption', 'plan', 'narrate', 'render', 'renarrate']),
  provider: z.enum(['workersAi', 'anthropic', 'elevenlabs', 'remotionLambda']),
  unit: z.enum([
    'audioSecond',
    'inputToken',
    'outputToken',
    'cacheWriteToken',
    'cacheReadToken',
    'character',
    'render',
  ]),
  units: z.number().int().min(0),
  microUsd: z.number().int().min(0),
  at: Timestamp,
});
export type CostLedgerRow = z.infer<typeof CostLedgerRow>;
