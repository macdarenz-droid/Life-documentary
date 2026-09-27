// The model chooses, the server times (D39): a PlannerOutput names moments only, and these functions
// build everything timed from the moments themselves. Pure.
import { EpisodePlanV1 } from '@life/contracts';
import type { PlannerOutput, WeekBriefV1 } from '@life/contracts';
import { CLOSING_MS, TITLE_CARD_MS, isMediaMoment, shotFor, shotMs } from './shots';

type BriefMoment = WeekBriefV1['moments'][number];

const LOWER_THIRD_DELAY_MS = 500;
const MODEL_MIN_TOTAL_MS = 30_000;

function lookup(brief: WeekBriefV1): (id: string) => BriefMoment {
  const moments = new Map(brief.moments.map((m) => [m.momentId as string, m]));
  return (id) => {
    const moment = moments.get(id);
    if (!moment) throw new Error(`moment ${id} is not in the brief`);
    return moment;
  };
}

/**
 * One error per cold open, shot or closing whose id is not an answer, clip or photo of the brief.
 * Run after the PlannerOutput parse and before anything else.
 */
export function planMomentErrors(output: PlannerOutput, brief: WeekBriefV1): string[] {
  const media = new Set(brief.moments.filter(isMediaMoment).map((m) => m.momentId as string));
  const errors: string[] = [];
  const check = (id: string, where: string) => {
    if (!media.has(id)) errors.push(`${where}: not a picture or sound from this week`);
  };
  check(output.coldOpen.momentId, 'cold open');
  output.scenes.forEach((scene, s) =>
    scene.shots.forEach((shot, i) => check(shot.momentId, `scene ${s} shot ${i}`)),
  );
  check(output.closing.momentId, 'closing');
  return errors;
}

/**
 * The episode's length: the cold open played whole, the title card, every shot and the closing.
 * Not clamped. Throws when a moment is not in the brief (planMomentErrors runs first).
 */
export function planDurationMs(output: PlannerOutput, brief: WeekBriefV1): number {
  const moment = lookup(brief);
  const shots = output.scenes.flatMap((s) => s.shots);
  return (
    shotMs(moment(output.coldOpen.momentId)) +
    TITLE_CARD_MS +
    shots.reduce((sum, shot) => sum + shotMs(moment(shot.momentId)), 0) +
    CLOSING_MS
  );
}

/** The timed, parsed plan for a model's output. Throws when a moment is missing or it does not parse. */
export function assemblePlan(
  output: PlannerOutput,
  brief: WeekBriefV1,
  { narratorVoiceId }: { narratorVoiceId: string },
): EpisodePlanV1 {
  const moment = lookup(brief);
  const coldOpenMs = shotMs(moment(output.coldOpen.momentId));

  // The timeline: the cold open, the title card, then the shots in order. A lower third is timed on
  // its moment's first scene shot; the cold open does not count.
  const firstShotAt = new Map<string, number>();
  let at = coldOpenMs + TITLE_CARD_MS;
  const scenes = output.scenes.map((scene) => {
    const shots = scene.shots.map((shot) => {
      const m = moment(shot.momentId);
      if (!firstShotAt.has(m.momentId)) firstShotAt.set(m.momentId, at);
      at += shotMs(m);
      return shotFor(m);
    });
    return {
      heading: scene.heading,
      ...(scene.storylineId !== undefined ? { storylineId: scene.storylineId } : {}),
      shots,
      ...(scene.narratorBridge !== undefined ? { narratorBridge: scene.narratorBridge } : {}),
      captionsFromTranscript: true,
    };
  });

  const lowerThirds = output.lowerThirds.flatMap((lt) => {
    const start = firstShotAt.get(lt.momentId);
    return start === undefined
      ? []
      : [{ momentId: lt.momentId, castId: lt.castId, atMs: start + LOWER_THIRD_DELAY_MS }];
  });
  const narrated = output.scenes.some((s) => s.narratorBridge !== undefined) || !!output.tease;

  return EpisodePlanV1.parse({
    version: 1,
    title: output.title,
    ...(output.subtitle !== undefined ? { subtitle: output.subtitle } : {}),
    episodeNumber: brief.episodeNumber,
    weekStart: brief.weekStart,
    weekEnd: brief.weekEnd,
    coldOpen: { momentId: output.coldOpen.momentId, inMs: 0, outMs: coldOpenMs },
    scenes,
    closing: { momentId: output.closing.momentId },
    ...(output.tease !== undefined ? { tease: output.tease } : {}),
    music: { mood: output.musicMood },
    lowerThirds,
    ...(narrated ? { narratorVoiceId } : {}),
    targetDurationMs: planDurationMs(output, brief),
    summary: output.summary,
  });
}

/**
 * Which plan a week gets: `model` with at least one answer, three media moments and a full-length
 * total of at least 30 s; `recap` for any other week with media; `empty` for a week without media.
 */
export function planEligibility(brief: WeekBriefV1): 'model' | 'recap' | 'empty' {
  const media = brief.moments.filter(isMediaMoment);
  if (media.length === 0) return 'empty';
  const answers = media.filter((m) => m.kind === 'answer');
  if (answers.length === 0 || media.length < 3) return 'recap';
  const longestAnswerMs = Math.max(...answers.map(shotMs));
  const fullMs =
    longestAnswerMs + TITLE_CARD_MS + media.reduce((sum, m) => sum + shotMs(m), 0) + CLOSING_MS;
  return fullMs >= MODEL_MIN_TOTAL_MS ? 'model' : 'recap';
}
