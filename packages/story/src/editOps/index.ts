// The five changes a person can make to an episode (P17, D43), as pure edits of the stored plan: rename
// it, swap a narrator line for one of their answers or their own words, take out a clip, pick the last
// shot, change the music. Each gives the new plan or the reason it can't. Only moments still in the
// rebuilt brief can be brought in, so a localOnly or deleted moment never is (CLAUDE.md rule 8), and a
// moment that has gone counts 0 ms (rule 10).
import {
  EpisodePlanV1,
  type EditChange,
  type EditRefusal,
  type EpisodeCut,
  type WeekBriefV1,
} from '@life/contracts';
import { speakable } from '../narration';
import { CLOSING_MS, TITLE_CARD_MS, shotFor, shotMs } from '../plan/shots';
import { narratorShare } from '../planValidation/validatePlan';

type BriefMoment = WeekBriefV1['moments'][number];
type Scene = EpisodePlanV1['scenes'][number];

export const MIN_EPISODE_MS = 20_000;
export const MAX_EPISODE_MS = 240_000;
export const MAX_SHOTS_PER_SCENE = 6;
/** The narrator's most of the spoken time (D40). */
export const MAX_NARRATOR_SHARE = 0.25;

export type EditOutcome = { ok: true; plan: EpisodePlanV1 } | { ok: false; reason: EditRefusal };

function momentsOf(brief: WeekBriefV1): Map<string, BriefMoment> {
  return new Map(brief.moments.map((m) => [m.momentId as string, m]));
}

/**
 * The episode's length from the plan: the cold open's span, the title card, each shot's span and the
 * closing. A moment that isn't in the brief counts 0 ms. Not clamped.
 */
export function planLengthMs(plan: EpisodePlanV1, brief: WeekBriefV1): number {
  const moments = momentsOf(brief);
  const coldOpen = moments.has(plan.coldOpen.momentId)
    ? plan.coldOpen.outMs - plan.coldOpen.inMs
    : 0;
  let shots = 0;
  for (const scene of plan.scenes) {
    for (const shot of scene.shots) {
      const moment = moments.get(shot.momentId);
      if (moment) shots += (shot.outMs ?? shotMs(moment)) - (shot.inMs ?? 0);
    }
  }
  return coldOpen + TITLE_CARD_MS + shots + CLOSING_MS;
}

/** The fields of the phone's cut that come from the plan. */
export function cutOf(
  plan: EpisodePlanV1,
  brief: WeekBriefV1,
): Pick<EpisodeCut, 'title' | 'narrated' | 'coldOpen' | 'scenes' | 'closing' | 'mood'> {
  const moments = momentsOf(brief);
  return {
    title: plan.title,
    narrated: plan.narratorVoiceId !== undefined,
    coldOpen: { momentId: plan.coldOpen.momentId },
    scenes: plan.scenes.map((scene) => ({
      heading: scene.heading,
      ...(scene.narratorBridge ? { line: scene.narratorBridge.text } : {}),
      shots: scene.shots.map((shot) => {
        const kind = moments.get(shot.momentId)?.kind;
        return {
          momentId: shot.momentId,
          ...(kind === 'answer' || kind === 'clip' || kind === 'photo' ? { kind } : {}),
        };
      }),
    })),
    closing: { momentId: plan.closing.momentId },
    mood: plan.music.mood,
  };
}

/** Whether the cut shows the moment, as the cold open or a shot. */
function inCut(plan: EpisodePlanV1, momentId: string): boolean {
  return (
    plan.coldOpen.momentId === momentId ||
    plan.scenes.some((scene) => scene.shots.some((shot) => shot.momentId === momentId))
  );
}

function withoutBridge(scene: Scene): Scene {
  const next = { ...scene };
  delete next.narratorBridge;
  return next;
}

/** Plain-data equality, whatever the key order. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

type Step = { ok: true; plan: EpisodePlanV1 } | { ok: false; reason: EditRefusal };

function change(plan: EpisodePlanV1, edit: EditChange, brief: WeekBriefV1): Step {
  const moments = momentsOf(brief);
  switch (edit.kind) {
    case 'retitle':
      return { ok: true, plan: { ...plan, title: edit.title.trim() } };

    case 'swapLine': {
      const scene = plan.scenes[edit.sceneIndex];
      if (!scene) return { ok: false, reason: 'noScene' };
      const scenes = [...plan.scenes];
      if (edit.with.kind === 'moment') {
        if (!scene.narratorBridge) return { ok: false, reason: 'noLine' };
        const moment = moments.get(edit.with.momentId);
        if (moment?.kind !== 'answer') return { ok: false, reason: 'notAnAnswer' };
        if (inCut(plan, moment.momentId)) return { ok: false, reason: 'alreadyIn' };
        if (scene.shots.length >= MAX_SHOTS_PER_SCENE) return { ok: false, reason: 'sceneFull' };
        const { inMs, outMs } = edit.with;
        const length = moment.durationMs;
        if (
          (outMs !== undefined && length !== undefined && outMs > length) ||
          (inMs !== undefined &&
            ((length !== undefined && inMs >= length) || (outMs ?? Infinity) <= inMs))
        ) {
          return { ok: false, reason: 'doesNotFit' };
        }
        const shot = {
          ...shotFor(moment),
          ...(inMs !== undefined ? { inMs } : {}),
          ...(outMs !== undefined ? { outMs } : {}),
        };
        scenes[edit.sceneIndex] = { ...withoutBridge(scene), shots: [shot, ...scene.shots] };
        const next = { ...plan, scenes };
        if (planLengthMs(next, brief) > MAX_EPISODE_MS) return { ok: false, reason: 'tooLong' };
        return { ok: true, plan: next };
      }
      if (plan.narratorVoiceId === undefined) return { ok: false, reason: 'noNarrator' };
      const text = edit.with.text.trim();
      if (!speakable(text)) return { ok: false, reason: 'hasNumbers' };
      scenes[edit.sceneIndex] = { ...scene, narratorBridge: { text } };
      const next = { ...plan, scenes };
      const before = narratorShare(plan, brief);
      const after = narratorShare(next, brief);
      if (after.narratorMs > before.narratorMs && after.share > MAX_NARRATOR_SHARE) {
        return { ok: false, reason: 'narratorTooLong' };
      }
      return { ok: true, plan: next };
    }

    case 'dropClip': {
      const scene = plan.scenes[edit.sceneIndex];
      if (!scene) return { ok: false, reason: 'noScene' };
      const dropped = scene.shots[edit.shotIndex];
      if (!dropped) return { ok: false, reason: 'noShot' };
      if (plan.scenes.reduce((n, s) => n + s.shots.length, 0) === 1) {
        return { ok: false, reason: 'lastShot' };
      }
      const shots = scene.shots.filter((_, i) => i !== edit.shotIndex);
      const scenes =
        shots.length > 0
          ? plan.scenes.map((s, i) => (i === edit.sceneIndex ? { ...s, shots } : s))
          : plan.scenes.filter((_, i) => i !== edit.sceneIndex);
      const shown = new Set(scenes.flatMap((s) => s.shots.map((shot) => shot.momentId as string)));
      const lowerThirds = plan.lowerThirds.filter((lt) => shown.has(lt.momentId));
      let closing = plan.closing;
      if (
        closing.momentId === dropped.momentId &&
        plan.coldOpen.momentId !== dropped.momentId &&
        !shown.has(dropped.momentId)
      ) {
        const last = scenes.at(-1)?.shots.at(-1);
        if (last) closing = { momentId: last.momentId };
      }
      const next = { ...plan, scenes, lowerThirds, closing };
      if (planLengthMs(next, brief) < MIN_EPISODE_MS) return { ok: false, reason: 'tooShort' };
      return { ok: true, plan: next };
    }

    case 'closingShot':
      if (!inCut(plan, edit.momentId)) return { ok: false, reason: 'notInCut' };
      return { ok: true, plan: { ...plan, closing: { momentId: edit.momentId } } };

    case 'musicMood':
      return { ok: true, plan: { ...plan, music: { mood: edit.mood } } };
  }
}

/**
 * Applies one change to the plan, or says why it can't (D43). The new plan's `targetDurationMs` is its
 * length clamped to 20 s to 240 s.
 */
export function applyEdit(plan: EpisodePlanV1, edit: EditChange, brief: WeekBriefV1): EditOutcome {
  const step = change(plan, edit, brief);
  if (!step.ok) return step;
  if (same(step.plan, plan)) return { ok: false, reason: 'unchanged' };
  const length = Math.min(MAX_EPISODE_MS, Math.max(MIN_EPISODE_MS, planLengthMs(step.plan, brief)));
  const parsed = EpisodePlanV1.safeParse({ ...step.plan, targetDurationMs: length });
  return parsed.success ? { ok: true, plan: parsed.data } : { ok: false, reason: 'doesNotFit' };
}
