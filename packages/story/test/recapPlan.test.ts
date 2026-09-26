import { EpisodePlanV1 } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import { recapPlan, recapWords, validatePlan, weekBrief } from '../src';
import { NAMES, fixtureWeeks } from './fixtures/weeks';

const briefs = fixtureWeeks().map((w) => ({ name: w.name, brief: weekBrief(w.input) }));
const hasMedia = (b: (typeof briefs)[number]['brief']) =>
  b.moments.some((m) => m.kind === 'answer' || m.kind === 'clip' || m.kind === 'photo');

describe('recapPlan for every fixture week', () => {
  it.each(briefs.map((b) => [b.name, b.brief] as const))('%s', (_, brief) => {
    const plan = recapPlan(brief);
    if (!hasMedia(brief)) {
      expect(plan).toBeNull();
      return;
    }
    expect(plan).not.toBeNull();
    if (!plan) return;
    expect(EpisodePlanV1.safeParse(plan).success).toBe(true);
    expect(validatePlan(plan, brief, 'recap')).toEqual({ ok: true });
    const ids = new Set(brief.moments.map((m) => m.momentId as string));
    const used = [
      plan.coldOpen.momentId,
      plan.closing.momentId,
      ...plan.scenes.flatMap((s) => s.shots.map((shot) => shot.momentId)),
    ];
    expect(used.every((id) => ids.has(id))).toBe(true);
    expect(plan.scenes.length).toBeLessThanOrEqual(5);
    expect(plan.scenes.every((s) => s.shots.length <= 6)).toBe(true);
    expect(recapPlan(brief)).toEqual(plan);
  });

  it('is null for exactly the weeks without media', () => {
    const nulls = briefs.filter((b) => recapPlan(b.brief) === null).map((b) => b.name);
    expect(nulls).toEqual(briefs.filter((b) => !hasMedia(b.brief)).map((b) => b.name));
    expect(nulls).toContain(NAMES.quiet);
  });
});

describe('recap shape', () => {
  const brief = (name: string) => {
    const found = briefs.find((b) => b.name === name);
    if (!found) throw new Error(`no week ${name}`);
    return found.brief;
  };

  it('merges the full week, with media on 7 days, into 5 scenes', () => {
    const plan = recapPlan(brief(NAMES.full));
    expect(plan?.scenes.map((s) => s.heading)).toEqual([
      'Monday to Tuesday',
      'Wednesday',
      'Thursday to Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(plan?.title).toBe(recapWords.title('2027-03-01'));
    expect(plan?.title).toBe('The week of 1 March');
  });

  it('gives the single-answer week one scene with the answer as cold open', () => {
    const b = brief(NAMES.single);
    const plan = recapPlan(b);
    const answer = b.moments.find((m) => m.kind === 'answer');
    expect(plan?.scenes).toHaveLength(1);
    expect(plan?.coldOpen.momentId).toBe(answer?.momentId);
  });
});
