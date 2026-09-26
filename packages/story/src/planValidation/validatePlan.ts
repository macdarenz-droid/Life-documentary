// Product rules a plan must meet before it is narrated or rendered (P11). Pure; one message per error,
// naming the scene and shot index.
import type { EpisodePlanV1, WeekBriefV1 } from '@life/contracts';
import type { TimelineResult } from '../render/timeline';

/** Spoken time of narrator text: 150 words a minute. */
export const NARRATOR_MS_PER_WORD = 400;
const DEFAULT_ANSWER_MS = 6000;
const MODEL_MIN_SCENES = 3;
const MODEL_MIN_DURATION_MS = 60_000;
const MODEL_MAX_DURATION_MS = 240_000;

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function validatePlan(
  plan: EpisodePlanV1,
  brief: WeekBriefV1,
  mode: 'model' | 'recap',
): TimelineResult {
  const errors: string[] = [];
  const moments = new Map(brief.moments.map((m) => [m.momentId as string, m]));
  const storylines = new Set(brief.storylines.map((s) => s.id as string));
  const cast = new Set(brief.cast.map((c) => c.id as string));

  const checkMoment = (id: string, where: string, outMs?: number) => {
    const moment = moments.get(id);
    if (!moment) {
      errors.push(`${where}: moment ${id} is not in the brief`);
      return;
    }
    if (outMs !== undefined && moment.durationMs !== undefined && outMs > moment.durationMs) {
      errors.push(`${where}: outMs ${outMs} is beyond the moment's ${moment.durationMs} ms`);
    }
  };

  if (plan.weekStart !== brief.weekStart)
    errors.push(`weekStart ${plan.weekStart} is not the brief's ${brief.weekStart}`);
  if (plan.weekEnd !== brief.weekEnd)
    errors.push(`weekEnd ${plan.weekEnd} is not the brief's ${brief.weekEnd}`);
  if (plan.episodeNumber !== brief.episodeNumber) {
    errors.push(`episodeNumber ${plan.episodeNumber} is not the brief's ${brief.episodeNumber}`);
  }

  checkMoment(plan.coldOpen.momentId, 'cold open', plan.coldOpen.outMs);
  plan.scenes.forEach((scene, s) => {
    if (scene.storylineId !== undefined && !storylines.has(scene.storylineId)) {
      errors.push(`scene ${s}: storyline ${scene.storylineId} is not in the brief`);
    }
    scene.shots.forEach((shot, i) =>
      checkMoment(shot.momentId, `scene ${s} shot ${i}`, shot.outMs),
    );
  });
  checkMoment(plan.closing.momentId, 'closing');
  if (plan.tease && !storylines.has(plan.tease.storylineId)) {
    errors.push(`tease: storyline ${plan.tease.storylineId} is not in the brief`);
  }
  plan.lowerThirds.forEach((lt, i) => {
    const where = `lower third ${i}`;
    checkMoment(lt.momentId, where);
    if (!cast.has(lt.castId)) {
      errors.push(`${where}: cast member ${lt.castId} is not in the brief`);
    } else if (moments.has(lt.momentId) && !moments.get(lt.momentId)?.castIds.includes(lt.castId)) {
      errors.push(`${where}: cast member ${lt.castId} is not in moment ${lt.momentId}`);
    }
  });

  const bridges = plan.scenes.flatMap((scene, s) =>
    scene.narratorBridge ? [{ s, text: scene.narratorBridge.text }] : [],
  );

  if (mode === 'model') {
    if (plan.scenes.length < MODEL_MIN_SCENES) {
      errors.push(
        `a model plan needs at least ${MODEL_MIN_SCENES} scenes, not ${plan.scenes.length}`,
      );
    }
    if (
      plan.targetDurationMs < MODEL_MIN_DURATION_MS ||
      plan.targetDurationMs > MODEL_MAX_DURATION_MS
    ) {
      errors.push(
        `targetDurationMs ${plan.targetDurationMs} is outside ${MODEL_MIN_DURATION_MS}–${MODEL_MAX_DURATION_MS}`,
      );
    }
    const coldOpen = moments.get(plan.coldOpen.momentId);
    if (coldOpen && coldOpen.kind !== 'answer')
      errors.push(`cold open: a ${coldOpen.kind} is not an answer`);
    if (plan.narratorVoiceId === undefined) {
      bridges.forEach(({ s }) =>
        errors.push(`scene ${s}: a narrator bridge needs narratorVoiceId`),
      );
      if (plan.tease) errors.push('tease: a tease needs narratorVoiceId');
    }

    const narratorMs =
      NARRATOR_MS_PER_WORD *
      (bridges.reduce((sum, b) => sum + wordCount(b.text), 0) +
        (plan.tease ? wordCount(plan.tease.text) : 0));
    let spokenMs = narratorMs + (plan.coldOpen.outMs - plan.coldOpen.inMs);
    for (const scene of plan.scenes) {
      for (const shot of scene.shots) {
        const moment = moments.get(shot.momentId);
        if (moment?.kind !== 'answer') continue;
        spokenMs += (shot.outMs ?? moment.durationMs ?? DEFAULT_ANSWER_MS) - (shot.inMs ?? 0);
      }
    }
    if (narratorMs * 4 > spokenMs) {
      errors.push(`narrator time ${narratorMs} ms is above 25% of spoken time ${spokenMs} ms`);
    }
  } else {
    bridges.forEach(({ s }) => errors.push(`scene ${s}: a recap has no narrator bridge`));
    if (plan.tease) errors.push('tease: a recap has no tease');
    if (plan.narratorVoiceId !== undefined) errors.push('a recap has no narratorVoiceId');
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
