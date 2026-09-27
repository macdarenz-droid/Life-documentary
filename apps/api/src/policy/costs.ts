// What understanding costs (P12, D38), in micro-dollars (µUSD) and whole numbers only: a transcript by
// audio second, a caption by input and output token at the Haiku 4.5 batch prices. An episode's cost in
// cents rounds its ledger's sum up.
import type { CostLedgerRow } from '@life/contracts';

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

/** ⌈Σ µUSD / 10,000⌉ cents. */
export function episodeCostCents(rows: readonly Pick<CostLedgerRow, 'microUsd'>[]): number {
  return ceilDiv(
    rows.reduce((sum, r) => sum + r.microUsd, 0),
    MICRO_USD_PER_CENT,
  );
}
