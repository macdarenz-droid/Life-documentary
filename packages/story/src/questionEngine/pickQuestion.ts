// The daily question engine (P7). Pure and deterministic: the same context always gives the same
// question. The first rule that applies and has an eligible template wins; names only fill slots.
import { QuestionPick } from '@life/contracts';
import type { LocalDate, QuestionTag, QuestionTemplate, Uuid } from '@life/contracts';
import { addDays, daysBetween, isWeekend } from '../dates';
import { fnv1a } from './fnv1a';
import type { QuestionContext } from './types';

const NO_REPEAT_DAYS = 60;
const MAX_TEXT = 200;

type Slot = 'storyline' | 'person' | 'place';
type Candidate = {
  reason: QuestionTag;
  slot?: { name: Slot; value: string };
  storylineId?: Uuid;
};

function key(name: string): string {
  return name.trim().toLowerCase();
}

function byName(a: string, b: string): number {
  const ka = key(a);
  const kb = key(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function byId(a: QuestionTemplate, b: QuestionTemplate): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function daysOn(ctx: QuestionContext, date: LocalDate) {
  return ctx.recentDays.filter((d) => d.date === date);
}

function momentsOn(ctx: QuestionContext, date: LocalDate): number {
  return daysOn(ctx, date).reduce((sum, d) => sum + d.momentCount, 0);
}

function daysAgo(ctx: QuestionContext, askedOn: LocalDate): number {
  return daysBetween(askedOn, ctx.today);
}

function isRecentlyAsked(ctx: QuestionContext, templateId: string): boolean {
  return ctx.history.some(
    (h) => h.templateId === templateId && daysAgo(ctx, h.askedOn) <= NO_REPEAT_DAYS,
  );
}

function fill(template: QuestionTemplate, slot: Candidate['slot']): string {
  if (!slot) return template.text;
  return template.text.split(`{${slot.name}}`).join(slot.value.trim());
}

function storylineCandidate(ctx: QuestionContext): Candidate | undefined {
  if (ctx.openStorylines.length === 0) return undefined;
  const asked = ctx.history.filter((h) => h.storylineId !== undefined);
  const inPrevious = (days: number) =>
    asked.filter((h) => {
      const ago = daysAgo(ctx, h.askedOn);
      return ago >= 1 && ago <= days;
    }).length;
  if (inPrevious(2) > 0 || inPrevious(6) >= 2) return undefined;

  const lastAsked = (id: Uuid): LocalDate | undefined =>
    asked
      .filter((h) => h.storylineId === id)
      .map((h) => h.askedOn)
      .sort()
      .at(-1);
  const [chosen] = [...ctx.openStorylines].sort((a, b) => {
    const la = lastAsked(a.id);
    const lb = lastAsked(b.id);
    if (la !== lb) {
      if (la === undefined) return -1;
      if (lb === undefined) return 1;
      return la < lb ? -1 : 1;
    }
    if (a.openedOn !== b.openedOn) return a.openedOn < b.openedOn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  if (!chosen) return undefined;
  return {
    reason: 'open_storyline',
    slot: { name: 'storyline', value: chosen.title },
    storylineId: chosen.id,
  };
}

function personCandidate(ctx: QuestionContext): Candidate | undefined {
  const yesterday = addDays(ctx.today, -1);
  const names = daysOn(ctx, yesterday)
    .flatMap((d) => d.castNames)
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .sort(byName);
  const [first] = names;
  return first === undefined
    ? undefined
    : { reason: 'person_seen', slot: { name: 'person', value: first } };
}

function placeCandidate(ctx: QuestionContext): Candidate | undefined {
  const yesterday = addDays(ctx.today, -1);
  const seen = new Set(ctx.placesBefore.map(key));
  for (const day of ctx.recentDays) {
    if (day.date !== yesterday) day.placeNames.forEach((p) => seen.add(key(p)));
  }
  const fresh = daysOn(ctx, yesterday)
    .flatMap((d) => d.placeNames)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !seen.has(key(p)))
    .sort(byName);
  const [first] = fresh;
  return first === undefined
    ? undefined
    : { reason: 'place_first_time', slot: { name: 'place', value: first } };
}

function ruleCandidates(ctx: QuestionContext): Candidate[] {
  const candidates: Candidate[] = [];
  const quiet = [1, 2, 3].every((n) => momentsOn(ctx, addDays(ctx.today, -n)) === 0);
  if (quiet) candidates.push({ reason: 'after_quiet_days' });
  if (ctx.momentsOneYearAgo > 0) candidates.push({ reason: 'anniversary' });
  for (const find of [storylineCandidate, personCandidate, placeCandidate]) {
    const candidate = find(ctx);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

function choose(
  ctx: QuestionContext,
  pool: QuestionTemplate[],
  hashKey: string,
): QuestionTemplate | undefined {
  const eligible = pool.filter((t) => !isRecentlyAsked(ctx, t.id)).sort(byId);
  if (eligible.length === 0) return undefined;
  return eligible[fnv1a(`${ctx.seed}:${ctx.today}:${hashKey}`) % eligible.length];
}

function dayPoolTags(today: LocalDate): QuestionTag[] {
  return ['general', 'season', isWeekend(today) ? 'weekend' : 'weekday'];
}

/** Returns exactly one question for `ctx.today`. Throws only when the bank has no day-pool template. */
export function pickQuestion(ctx: QuestionContext): QuestionPick {
  for (const candidate of ruleCandidates(ctx)) {
    const pool = ctx.templates.filter((t) => t.tags.includes(candidate.reason));
    const template = choose(ctx, pool, candidate.reason);
    if (!template) continue;
    const text = fill(template, candidate.slot);
    if (text.length > MAX_TEXT) continue;
    return QuestionPick.parse({
      templateId: template.id,
      reason: candidate.reason,
      text,
      ...(candidate.storylineId ? { storylineId: candidate.storylineId } : {}),
    });
  }

  const tags = dayPoolTags(ctx.today);
  const pool = ctx.templates.filter((t) => t.tags.some((tag) => tags.includes(tag)));
  const lastAsked = (id: string): LocalDate | undefined =>
    ctx.history
      .filter((h) => h.templateId === id)
      .map((h) => h.askedOn)
      .sort()
      .at(-1);
  const template =
    choose(ctx, pool, 'day') ??
    [...pool].sort((a, b) => {
      const la = lastAsked(a.id) ?? '';
      const lb = lastAsked(b.id) ?? '';
      return la !== lb ? (la < lb ? -1 : 1) : byId(a, b);
    })[0];
  if (!template) throw new Error('The question bank has no day-pool template');
  const reason = template.tags.find((tag) => tags.includes(tag)) ?? 'general';
  return QuestionPick.parse({ templateId: template.id, reason, text: template.text });
}
