// Builds the planner's view of one week from device rows. Pure and deterministic; only shareable
// moments of the week go in, and the brief is trimmed to a size budget.
import { WeekBriefV1 } from '@life/contracts';
import type {
  CastMember,
  Derived,
  LocalDate,
  MediaAsset,
  Moment,
  MomentKind,
  Question,
  Storyline,
  Uuid,
} from '@life/contracts';
import { addDays } from '../dates';
import { isShareable, localDay } from '../shareable';

export type WeekBriefInput = {
  documentaryId: Uuid;
  episodeNumber: number;
  weekStart: LocalDate;
  timeZone: string;
  moments: readonly Moment[];
  mediaAssets: readonly MediaAsset[];
  derived: readonly Derived[];
  questions: readonly Question[];
  storylines: readonly Storyline[];
  cast: readonly CastMember[];
  previousSummaries: readonly string[];
};

/** About 15k tokens. */
export const WEEK_BRIEF_BUDGET = 60_000;
const TRANSCRIPT_MAX = 1200;
const CAPTION_MAX = 300;
const DROP_ORDER: readonly MomentKind[] = ['note', 'photo', 'clip', 'answer'];

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Cuts `text` to at most `max` characters at a word boundary, ending with "…" when cut. */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const lastSpace = head.search(/\s\S*$/);
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head;
  return `${cut.trimEnd()}…`;
}

function latestDerived(derived: readonly Derived[]): Map<string, Derived> {
  const byMoment = new Map<string, Derived>();
  for (const d of derived) {
    const current = byMoment.get(d.momentId);
    if (!current || Date.parse(d.producedAt) > Date.parse(current.producedAt))
      byMoment.set(d.momentId, d);
  }
  return byMoment;
}

function build(input: WeekBriefInput, moments: readonly Moment[]) {
  const weekEnd = addDays(input.weekStart, 6);
  const assets = new Map(input.mediaAssets.map((a) => [a.id as string, a]));
  const questions = new Map(input.questions.map((q) => [q.id as string, q]));
  const derived = latestDerived(input.derived);
  const storylines = new Map(
    input.storylines
      .filter((s) => s.documentaryId === input.documentaryId && s.deletedAt === undefined)
      .map((s) => [s.id as string, s]),
  );
  const cast = new Map(
    input.cast
      .filter((c) => c.documentaryId === input.documentaryId && c.deletedAt === undefined)
      .map((c) => [c.id as string, c]),
  );

  const briefMoments = moments.map((m) => {
    const d = derived.get(m.id);
    const asset = m.mediaAssetId ? assets.get(m.mediaAssetId) : undefined;
    const question = m.questionId ? questions.get(m.questionId) : undefined;
    return {
      momentId: m.id,
      day: localDay(m.capturedAt, m.timeZone),
      kind: m.kind,
      ...(asset?.durationMs !== undefined ? { durationMs: asset.durationMs } : {}),
      ...(question ? { questionText: question.text } : {}),
      ...(d?.transcript !== undefined
        ? { transcript: cutAtWord(d.transcript, TRANSCRIPT_MAX) }
        : {}),
      ...(d?.caption !== undefined ? { caption: cutAtWord(d.caption, CAPTION_MAX) } : {}),
      ...(m.text !== undefined ? { text: m.text } : {}),
      ...(m.mood !== undefined ? { mood: m.mood } : {}),
      ...(m.placeName !== undefined ? { placeName: m.placeName } : {}),
      storylineIds: m.storylineIds.filter((id) => storylines.has(id)),
      castIds: m.castIds.filter((id) => cast.has(id)),
    };
  });

  const referencedStorylines = new Set(briefMoments.flatMap((m) => m.storylineIds as string[]));
  const referencedCast = new Set(briefMoments.flatMap((m) => m.castIds as string[]));
  const openInWeek = (s: Storyline) =>
    localDay(s.openedAt, input.timeZone) <= weekEnd &&
    (s.closedAt === undefined || localDay(s.closedAt, input.timeZone) >= input.weekStart);
  const isOpenAtWeekEnd = (s: Storyline) =>
    s.closedAt === undefined || localDay(s.closedAt, input.timeZone) > weekEnd;

  const includedIds = new Set(moments.map((m) => m.id as string));

  return {
    version: 1 as const,
    documentaryId: input.documentaryId,
    episodeNumber: input.episodeNumber,
    weekStart: input.weekStart,
    weekEnd,
    timeZone: input.timeZone,
    moments: briefMoments,
    storylines: [...storylines.values()]
      .filter((s) => referencedStorylines.has(s.id) || openInWeek(s))
      .sort((a, b) => compare(a.title, b.title) || compare(a.id, b.id))
      .map((s) => ({ id: s.id, title: s.title, open: isOpenAtWeekEnd(s) })),
    cast: [...cast.values()]
      .filter((c) => referencedCast.has(c.id))
      .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        ...(c.relation !== undefined ? { relation: c.relation } : {}),
      })),
    previousSummaries: input.previousSummaries.slice(-3),
    questionsAsked: input.questions
      .filter(
        (q) =>
          q.documentaryId === input.documentaryId &&
          q.askedOn >= input.weekStart &&
          q.askedOn <= weekEnd,
      )
      .sort((a, b) => compare(a.askedOn, b.askedOn) || compare(a.id, b.id))
      .map((q) => ({
        day: q.askedOn,
        text: q.text,
        answered: q.answeredByMomentId !== undefined && includedIds.has(q.answeredByMomentId),
      })),
  };
}

/** The planner's brief for the week starting `input.weekStart`, within WEEK_BRIEF_BUDGET characters. */
export function weekBrief(input: WeekBriefInput): WeekBriefV1 {
  const weekEnd = addDays(input.weekStart, 6);
  let moments = input.moments
    .filter((m) => m.documentaryId === input.documentaryId && isShareable(m))
    .filter((m) => {
      const day = localDay(m.capturedAt, m.timeZone);
      return day >= input.weekStart && day <= weekEnd;
    })
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) || compare(a.id, b.id));

  let brief = build(input, moments);
  while (JSON.stringify(brief).length > WEEK_BRIEF_BUDGET && moments.length > 0) {
    const kind = DROP_ORDER.find((k) => moments.some((m) => m.kind === k));
    const drop = moments.find((m) => m.kind === kind);
    moments = moments.filter((m) => m !== drop);
    brief = build(input, moments);
  }
  return WeekBriefV1.parse(brief);
}
