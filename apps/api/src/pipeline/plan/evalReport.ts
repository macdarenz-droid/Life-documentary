// The planner evaluation's scoring (P13, D39): one row per fixture week with what it expects, what the
// planner gave and how the plan scores, the pass rule, and the Markdown report. Runs in Node for the eval
// and in the Workers pool for its tests; it reaches the planner only through the port.
import type { WeekBriefV1 } from '@life/contracts';
import {
  planEligibility,
  planProperties,
  weekBrief,
  type PlanProperties,
  type WeekBriefInput,
} from '@life/story';
import { planCostRows } from '../../policy/costs';
import type { PlanUsage, Planner } from '../ports';
import { planOnce, type PlanOnceResult } from './planOnce';

export type Expectation = ReturnType<typeof planEligibility>;

export type EvalRow = {
  week: string;
  expected: Expectation;
  /** `none` when the week got no model call. */
  outcome: PlanOnceResult['outcome'] | 'none';
  calls: number;
  properties?: PlanProperties;
  tokens: number;
  microUsd: number;
};

/** The score of one week: its expectation, the planner's outcome, the plan's properties and the cost. */
export function evalRow(week: string, brief: WeekBriefV1, result?: PlanOnceResult): EvalRow {
  const usage: PlanUsage | undefined = result?.usage;
  const tokens = usage
    ? usage.inputTokens + usage.outputTokens + usage.cacheWriteTokens + usage.cacheReadTokens
    : 0;
  return {
    week,
    expected: planEligibility(brief),
    outcome: result?.outcome ?? 'none',
    calls: result?.calls ?? 0,
    ...(result?.outcome === 'model' ? { properties: planProperties(result.plan, brief) } : {}),
    tokens,
    microUsd: usage ? planCostRows(usage).reduce((sum, r) => sum + r.microUsd, 0) : 0,
  };
}

const MIN_USER_VOICE_SHARE = 0.75;

/**
 * An eligible week passes with a model plan whose every property holds and whose user voice share is at
 * least 0.75; a recap or empty week passes when the model was not called.
 */
export function passes(row: EvalRow): boolean {
  if (row.expected !== 'model') return row.outcome === 'none' && row.calls === 0;
  const p = row.properties;
  return (
    row.outcome === 'model' &&
    p !== undefined &&
    p.valid &&
    p.coldOpenIsAnswer &&
    p.momentsFromBrief &&
    p.titleNotGeneric &&
    p.noCopiedWords &&
    p.voiceClean &&
    p.userVoiceShare >= MIN_USER_VOICE_SHARE
  );
}

const yesNo = (value: boolean | undefined) => (value === undefined ? '' : value ? 'yes' : 'no');

/** A Markdown table with one row per week and a totals line. */
export function reportTable(rows: readonly EvalRow[]): string {
  const head = [
    '| Week | Expected | Outcome | Calls | Valid | User voice | Cold open is an answer | Moments from the brief | Title not generic | No copied words | Voice clean | Tokens | µUSD | Pass |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const body = rows.map((r) => {
    const p = r.properties;
    return `| ${[
      r.week,
      r.expected,
      r.outcome,
      String(r.calls),
      yesNo(p?.valid),
      p ? p.userVoiceShare.toFixed(2) : '',
      yesNo(p?.coldOpenIsAnswer),
      yesNo(p?.momentsFromBrief),
      yesNo(p?.titleNotGeneric),
      yesNo(p?.noCopiedWords),
      yesNo(p?.voiceClean),
      String(r.tokens),
      String(r.microUsd),
      yesNo(passes(r)),
    ].join(' | ')} |`;
  });
  const passed = rows.filter(passes).length;
  const microUsd = rows.reduce((sum, r) => sum + r.microUsd, 0);
  return [
    ...head,
    ...body,
    '',
    `Passed ${passed} of ${rows.length} weeks. Total ${microUsd} µUSD.`,
    '',
  ].join('\n');
}

export type EvalWeek = { name: string; input: WeekBriefInput };

/**
 * Plans each week as a first episode with no earlier summaries: the model (with its retry) only for an
 * eligible week. Weeks run one after another, in order.
 */
export async function evaluateWeeks(
  weeks: readonly EvalWeek[],
  planner: Planner,
  options: { effort?: 'low' | 'medium' | 'high' } = {},
): Promise<EvalRow[]> {
  const rows: EvalRow[] = [];
  for (const week of weeks) {
    const brief = weekBrief({ ...week.input, episodeNumber: 1, previousSummaries: [] });
    const result =
      planEligibility(brief) === 'model' ? await planOnce(brief, planner, options) : undefined;
    rows.push(evalRow(week.name, brief, result));
  }
  return rows;
}
