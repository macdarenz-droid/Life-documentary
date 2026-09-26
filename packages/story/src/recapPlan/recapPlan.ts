// The recap: a plan built without a model or a narrator, so every week with footage gets an episode
// (D20). Pure and deterministic.
import { EpisodePlanV1 } from '@life/contracts';
import type { WeekBriefV1 } from '@life/contracts';
import { recapWords } from '../words/recap';

type BriefMoment = WeekBriefV1['moments'][number];

/** DESIGN §2 texture.kenBurns; `packages/story` must not import `@life/design`. */
const KEN_BURNS_FROM_SCALE = 1;
const KEN_BURNS_TO_SCALE = 1.06;
const TITLE_MS = 3000;
const CLOSING_MS = 2500;
const ANSWER_DEFAULT_MS = 6000;
const CLIP_MAX_MS = 6000;
const PHOTO_MS = 3000;
const MIN_TARGET_MS = 20_000;
const MAX_TARGET_MS = 240_000;
const MAX_SCENES = 5;
const MAX_SHOTS = 6;

function isMedia(m: BriefMoment): boolean {
  return m.kind === 'answer' || m.kind === 'clip' || m.kind === 'photo';
}

function shotLengthMs(m: BriefMoment): number {
  if (m.kind === 'answer') return m.durationMs ?? ANSWER_DEFAULT_MS;
  if (m.kind === 'clip') return Math.min(m.durationMs ?? CLIP_MAX_MS, CLIP_MAX_MS);
  return PHOTO_MS;
}

type Group = { firstDay: string; lastDay: string; moments: BriefMoment[] };

/** A plan with titles, music and the week's footage, or null when the week has no media. */
export function recapPlan(brief: WeekBriefV1): EpisodePlanV1 | null {
  const media = brief.moments.filter(isMedia);
  const first = media[0];
  const last = media.at(-1);
  if (!first || !last) return null;

  const order = new Map(media.map((m, i) => [m.momentId as string, i]));
  const firstAnswer = media.find((m) => m.kind === 'answer');
  const coldOpen = firstAnswer
    ? {
        momentId: firstAnswer.momentId,
        inMs: 0,
        outMs: firstAnswer.durationMs ?? ANSWER_DEFAULT_MS,
      }
    : { momentId: first.momentId, inMs: 0, outMs: shotLengthMs(first) };

  const days = [...new Set(media.map((m) => m.day))].sort();
  const groups: Group[] = days.map((day) => ({
    firstDay: day,
    lastDay: day,
    moments: media.filter((m) => m.day === day),
  }));
  while (groups.length > MAX_SCENES) {
    let best = 0;
    for (let i = 1; i < groups.length - 1; i++) {
      const size = (k: number) =>
        (groups[k]?.moments.length ?? 0) + (groups[k + 1]?.moments.length ?? 0);
      if (size(i) < size(best)) best = i;
    }
    const [a, b] = groups.splice(best, 2) as [Group, Group];
    groups.splice(best, 0, {
      firstDay: a.firstDay,
      lastDay: b.lastDay,
      moments: [...a.moments, ...b.moments],
    });
  }

  const rank = (m: BriefMoment) => (m.kind === 'answer' ? 0 : 1);
  let shotsMs = 0;
  const scenes = groups.map((g) => {
    const kept = [...g.moments]
      .sort(
        (x, y) => rank(x) - rank(y) || (order.get(x.momentId) ?? 0) - (order.get(y.momentId) ?? 0),
      )
      .slice(0, MAX_SHOTS);
    const shots = kept.map((m) => {
      shotsMs += shotLengthMs(m);
      if (m.kind === 'photo') {
        return {
          momentId: m.momentId,
          kenBurns: { fromScale: KEN_BURNS_FROM_SCALE, toScale: KEN_BURNS_TO_SCALE },
        };
      }
      if (m.kind === 'clip') return { momentId: m.momentId, inMs: 0, outMs: shotLengthMs(m) };
      return { momentId: m.momentId };
    });
    const firstWord = recapWords.weekday(g.firstDay);
    const heading =
      g.firstDay === g.lastDay
        ? firstWord
        : recapWords.merged(firstWord, recapWords.weekday(g.lastDay));
    return { heading, shots, captionsFromTranscript: true };
  });

  const target = TITLE_MS + shotsMs + CLOSING_MS;
  return EpisodePlanV1.parse({
    version: 1,
    title: recapWords.title(brief.weekStart),
    episodeNumber: brief.episodeNumber,
    weekStart: brief.weekStart,
    weekEnd: brief.weekEnd,
    coldOpen,
    scenes,
    closing: { momentId: last.momentId },
    music: { mood: 'calm' },
    lowerThirds: [],
    targetDurationMs: Math.min(Math.max(target, MIN_TARGET_MS), MAX_TARGET_MS),
    summary: recapWords.summary(brief.weekStart, brief.weekEnd),
  });
}
