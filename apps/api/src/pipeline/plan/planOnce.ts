// Planning one episode with the model (P13, D39), with no D1: the first call, the checks in order, and one
// retry as a conversation when the answer is unusable and not refused. The eval runner uses this same
// function. Error strings name fields, ids and numbers only, never the model's or the person's words.
import type { EpisodePlanV1 } from '@life/contracts';
import { PlannerOutput, type WeekBriefV1 } from '@life/contracts';
import {
  assemblePlan,
  planCopyErrors,
  planDurationMs,
  planMomentErrors,
  planVoiceErrors,
  validatePlan,
} from '@life/story';
import { ZodError, type z } from 'zod';
import type { PlanAnswer, PlanMessage, PlanUsage, Planner } from '../ports';
import { NARRATOR_VOICE, PLAN_EFFORT, PLAN_MAX_TOKENS, PLAN_MODEL } from './settings';
import { STYLE_PROMPT } from './stylePrompt';

export type PlanOnceResult = (
  { outcome: 'model'; plan: EpisodePlanV1 } | { outcome: 'invalid' | 'refused'; errors: string[] }
) & { usage: PlanUsage; calls: number };

type Checked =
  | { kind: 'model'; plan: EpisodePlanV1 }
  | { kind: 'refused' }
  | { kind: 'invalid'; errors: string[] };

const MIN_MS = 30_000;
const MAX_MS = 240_000;
export const RETRY_HEADING = 'Errors in your earlier answer:';

function issues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`);
}

function seconds(ms: number): string {
  return String(Math.round(ms / 100) / 10);
}

/** The checks of D39 in order: the first that finds anything makes the answer unusable. */
export function checkAnswer(answer: PlanAnswer, brief: WeekBriefV1): Checked {
  if (answer.stopReason === 'refusal') return { kind: 'refused' };
  const bad = (errors: string[]): Checked => ({ kind: 'invalid', errors });
  if (answer.stopReason === 'max_tokens' || answer.stopReason === 'model_context_window_exceeded')
    return bad(['The answer was cut off.']);
  if (answer.text === undefined || answer.text.trim() === '')
    return bad(['The answer had no text.']);
  let json: unknown;
  try {
    json = JSON.parse(answer.text);
  } catch {
    return bad(['The answer was not JSON.']);
  }
  const parsed = PlannerOutput.safeParse(json);
  if (!parsed.success) return bad(issues(parsed.error));
  const output = parsed.data;

  const momentErrors = planMomentErrors(output, brief);
  if (momentErrors.length > 0) return bad(momentErrors);
  const ms = planDurationMs(output, brief);
  if (ms < MIN_MS || ms > MAX_MS)
    return bad([`The episode is ${seconds(ms)} s long, it must be 30 to 240 s.`]);

  let plan: EpisodePlanV1;
  try {
    plan = assemblePlan(output, brief, { narratorVoiceId: NARRATOR_VOICE });
  } catch (error) {
    return bad(error instanceof ZodError ? issues(error) : ['The plan could not be built.']);
  }
  const valid = validatePlan(plan, brief, 'model');
  if (!valid.ok) return bad(valid.errors);
  const voice = planVoiceErrors(plan);
  if (voice.length > 0) return bad(voice);
  const copies = planCopyErrors(plan, brief);
  if (copies.length > 0) return bad(copies);
  return { kind: 'model', plan };
}

function add(a: PlanUsage, b: PlanUsage): PlanUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}

const NO_USAGE: PlanUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
};

/**
 * Plans the week with at most two answered calls. An error on the first call is thrown (the step
 * retries); an error on the retry call gives `invalid` with the first answer's errors and the usage so far.
 */
export async function planOnce(
  brief: WeekBriefV1,
  planner: Planner,
  { effort = PLAN_EFFORT }: { effort?: 'low' | 'medium' | 'high' } = {},
): Promise<PlanOnceResult> {
  const briefJson = JSON.stringify(brief);
  const ask = (messages: PlanMessage[]) =>
    planner.plan({
      model: PLAN_MODEL,
      system: STYLE_PROMPT,
      messages,
      effort,
      maxTokens: PLAN_MAX_TOKENS,
    });
  const result = (checked: Checked, usage: PlanUsage, calls: number): PlanOnceResult =>
    checked.kind === 'model'
      ? { outcome: 'model', plan: checked.plan, usage, calls }
      : checked.kind === 'refused'
        ? { outcome: 'refused', errors: [], usage, calls }
        : { outcome: 'invalid', errors: checked.errors, usage, calls };

  const first = await ask([{ role: 'user', text: briefJson }]);
  const firstChecked = checkAnswer(first, brief);
  if (firstChecked.kind !== 'invalid') return result(firstChecked, first.usage, 1);

  const errorsText = [RETRY_HEADING, ...firstChecked.errors].join('\n');
  // An empty assistant turn is refused by the API: with no text, the errors follow the brief.
  const messages: PlanMessage[] =
    first.text !== undefined && first.text.trim() !== ''
      ? [
          { role: 'user', text: briefJson },
          { role: 'assistant', text: first.text },
          { role: 'user', text: errorsText },
        ]
      : [{ role: 'user', text: `${briefJson}\n\n${errorsText}` }];
  let second: PlanAnswer;
  try {
    second = await ask(messages);
  } catch (error) {
    console.error('The planner failed on the retry; the week gets the recap.', error);
    return result(firstChecked, add(NO_USAGE, first.usage), 1);
  }
  return result(checkAnswer(second, brief), add(first.usage, second.usage), 2);
}
