import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';

/**
 * What one step of an episode cost, per unit (P12): one row per episode, step and unit, in micro-dollars
 * (µUSD, integers).
 */
export const CostLedgerRow = z.object({
  id: Uuid,
  episodeId: Uuid,
  step: z.enum(['transcribe', 'caption']),
  provider: z.enum(['workersAi', 'anthropic']),
  unit: z.enum(['audioSecond', 'inputToken', 'outputToken']),
  units: z.number().int().min(0),
  microUsd: z.number().int().min(0),
  at: Timestamp,
});
export type CostLedgerRow = z.infer<typeof CostLedgerRow>;
