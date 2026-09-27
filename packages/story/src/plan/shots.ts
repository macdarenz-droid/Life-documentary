// How long each moment plays and how its shot is made (D39): one rule for the recap and the model
// plan. An answer plays whole, a clip plays its first 6 s at most, a photo holds 3 s with Ken Burns.
import type { EpisodePlanV1, WeekBriefV1 } from '@life/contracts';

type BriefMoment = WeekBriefV1['moments'][number];
export type PlanShot = EpisodePlanV1['scenes'][number]['shots'][number];

/** DESIGN §2 texture.kenBurns; `packages/story` must not import `@life/design`. */
const KEN_BURNS_FROM_SCALE = 1;
const KEN_BURNS_TO_SCALE = 1.06;
export const TITLE_CARD_MS = 3000;
export const CLOSING_MS = 2500;
const ANSWER_DEFAULT_MS = 6000;
const CLIP_MAX_MS = 6000;
const PHOTO_MS = 3000;

/** Milliseconds a moment plays as a shot. */
export function shotMs(moment: BriefMoment): number {
  if (moment.kind === 'answer') return moment.durationMs ?? ANSWER_DEFAULT_MS;
  if (moment.kind === 'clip') return Math.min(moment.durationMs ?? CLIP_MAX_MS, CLIP_MAX_MS);
  return PHOTO_MS;
}

/** The shot a moment makes. */
export function shotFor(moment: BriefMoment): PlanShot {
  if (moment.kind === 'photo') {
    return {
      momentId: moment.momentId,
      kenBurns: { fromScale: KEN_BURNS_FROM_SCALE, toScale: KEN_BURNS_TO_SCALE },
    };
  }
  if (moment.kind === 'clip') return { momentId: moment.momentId, inMs: 0, outMs: shotMs(moment) };
  return { momentId: moment.momentId };
}

/** An answer, clip or photo: a moment with a picture or sound. */
export function isMediaMoment(moment: BriefMoment): boolean {
  return moment.kind === 'answer' || moment.kind === 'clip' || moment.kind === 'photo';
}
