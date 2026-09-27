// What the planner evaluation scores for one plan (P13). Pure.
import type { EpisodePlanV1, WeekBriefV1 } from '@life/contracts';
import { narratorShare, validatePlan } from '../planValidation/validatePlan';
import { recapWords } from '../words/recap';
import { planCopyErrors, planVoiceErrors } from './words';

export type PlanProperties = {
  valid: boolean;
  userVoiceShare: number;
  coldOpenIsAnswer: boolean;
  momentsFromBrief: boolean;
  titleNotGeneric: boolean;
  noCopiedWords: boolean;
  voiceClean: boolean;
};

const GENERIC_TITLES = new Set([
  'my week',
  'this week',
  'the week',
  'a week',
  'a week in review',
  'week in review',
  'weekly recap',
  'highlights',
]);
const NUMBERED_TITLE = /^(week|episode) \d+$/;

function isGenericTitle(title: string, brief: WeekBriefV1): boolean {
  const t = title.trim().toLowerCase();
  return (
    t === recapWords.title(brief.weekStart).toLowerCase() ||
    GENERIC_TITLES.has(t) ||
    NUMBERED_TITLE.test(t)
  );
}

export function planProperties(plan: EpisodePlanV1, brief: WeekBriefV1): PlanProperties {
  const moments = new Map(brief.moments.map((m) => [m.momentId as string, m]));
  const used = [
    plan.coldOpen.momentId,
    ...plan.scenes.flatMap((s) => s.shots.map((shot) => shot.momentId)),
    plan.closing.momentId,
    ...plan.lowerThirds.map((lt) => lt.momentId),
  ];
  return {
    valid: validatePlan(plan, brief, 'model').ok,
    userVoiceShare: 1 - narratorShare(plan, brief).share,
    coldOpenIsAnswer: moments.get(plan.coldOpen.momentId)?.kind === 'answer',
    momentsFromBrief: used.every((id) => moments.has(id)),
    titleNotGeneric: !isGenericTitle(plan.title, brief),
    noCopiedWords: planCopyErrors(plan, brief).length === 0,
    voiceClean: planVoiceErrors(plan).length === 0,
  };
}
