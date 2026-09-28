// What understanding, planning and narration cost (P12, D38; P13, D39; P14, D40), in micro-dollars (µUSD)
// and whole numbers only: a transcript by audio second, a caption by input and output token at the Haiku
// 4.5 batch prices, a plan by token at the Sonnet 5 prices, narration by character. An episode's cost in
// cents rounds its ledger's sum up.
import type { CostLedgerRow } from '@life/contracts';
import type { PlanUsage } from '../pipeline/ports';

/** Workers AI whisper-large-v3-turbo: µUSD per audio minute. */
export const TRANSCRIBE_MICRO_USD_PER_MINUTE = 513;
/** Claude Haiku 4.5 through the Message Batches API: µUSD per two input tokens (0.5 each). */
const CAPTION_MICRO_USD_PER_TWO_INPUT_TOKENS = 1;
/** Claude Haiku 4.5 through the Message Batches API: µUSD per two output tokens (2.5 each). */
const CAPTION_MICRO_USD_PER_TWO_OUTPUT_TOKENS = 5;
const MICRO_USD_PER_CENT = 10_000;

/** ⌈a / b⌉ for whole numbers a ≥ 0 and b > 0. */
function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

function wholeUnits(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error('Costs are counted in whole units.');
  return n;
}

/** ⌈seconds × 513 / 60⌉ µUSD. */
export function transcribeMicroUsd(seconds: number): number {
  return ceilDiv(wholeUnits(seconds) * TRANSCRIBE_MICRO_USD_PER_MINUTE, 60);
}

/** ⌈input × 0.5⌉ + ⌈output × 2.5⌉ µUSD. */
export function captionMicroUsd(inputTokens: number, outputTokens: number): number {
  return (
    ceilDiv(wholeUnits(inputTokens) * CAPTION_MICRO_USD_PER_TWO_INPUT_TOKENS, 2) +
    ceilDiv(wholeUnits(outputTokens) * CAPTION_MICRO_USD_PER_TWO_OUTPUT_TOKENS, 2)
  );
}

/**
 * Claude Sonnet 5, in µUSD per ten tokens: input 2, output 10 (thinking included), a 1-hour cache write 4
 * and a cache read 0.2 each.
 */
const PLAN_MICRO_USD_PER_TEN_TOKENS = {
  inputToken: 20,
  outputToken: 100,
  cacheWriteToken: 40,
  cacheReadToken: 2,
} as const;

export type PlanCostRow = {
  unit: keyof typeof PLAN_MICRO_USD_PER_TEN_TOKENS;
  units: number;
  microUsd: number;
};

/** One row per unit used, `usage` summed over the step's calls; each row rounds up once. */
export function planCostRows(usage: PlanUsage): PlanCostRow[] {
  const counts: [PlanCostRow['unit'], number][] = [
    ['inputToken', usage.inputTokens],
    ['outputToken', usage.outputTokens],
    ['cacheWriteToken', usage.cacheWriteTokens],
    ['cacheReadToken', usage.cacheReadTokens],
  ];
  return counts
    .filter(([, units]) => wholeUnits(units) > 0)
    .map(([unit, units]) => ({
      unit,
      units,
      microUsd: ceilDiv(units * PLAN_MICRO_USD_PER_TEN_TOKENS[unit], 10),
    }));
}

/** ElevenLabs Flash: µUSD per character ($0.05 per 1,000). */
const NARRATE_MICRO_USD_PER_CHARACTER = 50;

/** 50 µUSD per character ElevenLabs billed. */
export function narrateMicroUsd(characters: number): number {
  return wholeUnits(characters) * NARRATE_MICRO_USD_PER_CHARACTER;
}

const MICRO_USD_PER_USD = 1_000_000;

/** ⌈costUsd × 1,000,000⌉ µUSD: a render's accrued cost as Remotion estimates it. */
export function renderMicroUsd(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error('A cost is a number of dollars.');
  // toFixed drops float noise (0.0123 × 10⁶ is 12300.000000000002), so only a real fraction rounds up.
  return Math.ceil(Number((costUsd * MICRO_USD_PER_USD).toFixed(6)));
}

/** ⌈Σ µUSD / 10,000⌉ cents. */
export function episodeCostCents(rows: readonly Pick<CostLedgerRow, 'microUsd'>[]): number {
  return ceilDiv(
    rows.reduce((sum, r) => sum + r.microUsd, 0),
    MICRO_USD_PER_CENT,
  );
}
