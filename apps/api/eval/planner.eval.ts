// The planner evaluation (P13, D39): the real planner over the 20 fixture weeks, scored and printed as a
// Markdown table. Run with `pnpm --filter @life/api eval:planner`; never part of `pnpm test` or CI.
// Options come from the environment: PLAN_EFFORT (low, medium or high) and EVAL_WEEK (one week number).
import { fixtureWeeks } from '@life/story/fixtures';
import { it } from 'vitest';
import { evaluateWeeks, reportTable } from '../src/pipeline/plan/evalReport';
import { PLAN_EFFORT } from '../src/pipeline/plan/settings';
import { anthropicMessages, anthropicPlanner } from '../src/providers/anthropic/planner';

const EFFORTS = ['low', 'medium', 'high'] as const;
type Effort = (typeof EFFORTS)[number];

function effortOf(value: string | undefined): Effort {
  if (value === undefined || value === '') return PLAN_EFFORT;
  const effort = EFFORTS.find((e) => e === value);
  if (!effort) throw new Error(`PLAN_EFFORT must be low, medium or high, not ${value}.`);
  return effort;
}

it('evaluates the planner over the fixture weeks', { timeout: 60 * 60 * 1000 }, async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    process.stdout.write('Skipped: ANTHROPIC_API_KEY is not set.\n');
    return;
  }
  const effort = effortOf(process.env.PLAN_EFFORT);
  const only = process.env.EVAL_WEEK;
  const weeks = fixtureWeeks().filter((_, i) => !only || String(i + 1) === only);
  if (weeks.length === 0) throw new Error(`There is no fixture week ${only}.`);
  const rows = await evaluateWeeks(weeks, anthropicPlanner(anthropicMessages(apiKey)), { effort });
  process.stdout.write(`Effort: ${effort}\n\n${reportTable(rows)}`);
});
