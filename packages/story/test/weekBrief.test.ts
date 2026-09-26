import { WeekBriefV1 } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import { WEEK_BRIEF_BUDGET, weekBrief } from '../src';
import { NAMES, fixtureWeeks, type FixtureWeek } from './fixtures/weeks';

const weeks = fixtureWeeks();
function week(name: string): FixtureWeek {
  const found = weeks.find((w) => w.name === name);
  if (!found) throw new Error(`no fixture week "${name}"`);
  return found;
}

describe('fixture weeks', () => {
  it('has 20 named weeks', () => {
    expect(weeks).toHaveLength(20);
    expect(new Set(weeks.map((w) => w.name)).size).toBe(20);
  });

  it.each(weeks.map((w) => [w.name, w] as const))('%s gives a brief that parses', (_, w) => {
    expect(WeekBriefV1.safeParse(weekBrief(w.input)).success).toBe(true);
  });
});

describe('weekBrief', () => {
  it('never carries a local-only or deleted moment', () => {
    const { input } = week(NAMES.private);
    const hidden = input.moments.filter((m) => m.localOnly || m.deletedAt !== undefined);
    expect(hidden).toHaveLength(4);
    const json = JSON.stringify(weekBrief(input));
    for (const m of hidden) {
      expect(json).not.toContain(m.id);
      if (m.mediaAssetId) expect(json).not.toContain(m.mediaAssetId);
    }
    expect(weekBrief(input).moments).toHaveLength(3);
  });

  it('puts moments around local midnight on the right days and leaves out the next Monday', () => {
    const { input } = week(NAMES.midnight);
    const brief = weekBrief(input);
    const dayOf = (capturedAt: string) => {
      const m = input.moments.find((x) => x.capturedAt === capturedAt);
      return brief.moments.find((b) => b.momentId === m?.id)?.day;
    };
    expect(dayOf('2027-05-11T21:59:00Z')).toBe('2027-05-11');
    expect(dayOf('2027-05-11T22:01:00Z')).toBe('2027-05-12');
    expect(dayOf('2027-05-16T21:59:00Z')).toBe('2027-05-16');
    expect(dayOf('2027-05-16T22:01:00Z')).toBeUndefined();
    expect(dayOf('2027-05-09T21:59:00Z')).toBeUndefined();
    expect(brief.moments).toHaveLength(3);
  });

  it('keeps the DST week and the Manila week on local days', () => {
    expect(weekBrief(week(NAMES.dublin).input).moments.map((m) => m.day)).toEqual([
      '2026-10-23',
      '2026-10-25',
      '2026-10-25',
    ]);
    expect(weekBrief(week(NAMES.manila).input).moments.map((m) => m.day)).toEqual([
      '2027-05-03',
      '2027-05-04',
      '2027-05-05',
      '2027-05-06',
      '2027-05-09',
    ]);
  });

  it('fits the heavy week in the budget, keeps every answer and drops notes first', () => {
    const { input } = week(NAMES.heavy);
    expect(input.moments).toHaveLength(220);
    const brief = weekBrief(input);
    expect(JSON.stringify(brief).length).toBeLessThanOrEqual(WEEK_BRIEF_BUDGET);
    const kept = (kind: string) => brief.moments.filter((m) => m.kind === kind).length;
    const given = (kind: string) => input.moments.filter((m) => m.kind === kind).length;
    expect(kept('answer')).toBe(given('answer'));
    expect(kept('note')).toBeLessThan(given('note'));
    if (kept('note') > 0) {
      expect(kept('photo')).toBe(given('photo'));
      expect(kept('clip')).toBe(given('clip'));
    }
  });

  it('cuts long transcripts to 1,200 characters ending with an ellipsis', () => {
    const brief = weekBrief(week(NAMES.heavy).input);
    const transcripts = brief.moments.flatMap((m) =>
      m.kind === 'answer' && m.transcript ? [m.transcript] : [],
    );
    expect(transcripts.length).toBeGreaterThan(0);
    for (const t of transcripts) {
      expect(t.length).toBeLessThanOrEqual(1200);
      expect(t.endsWith('…')).toBe(true);
    }
  });

  it('gives the same brief for the same input', () => {
    const { input } = week(NAMES.full);
    expect(weekBrief(input)).toEqual(weekBrief(input));
  });

  it('keeps the last three summaries, oldest first', () => {
    expect(weekBrief(week(NAMES.full).input).previousSummaries).toEqual([
      'Week two.',
      'Week three.',
      'Week four.',
    ]);
  });

  it('lists both open storylines and the four people, sorted', () => {
    const brief = weekBrief(week(NAMES.storylines).input);
    expect(brief.storylines.map((s) => [s.title, s.open])).toEqual([
      ['The new job', true],
      ['Training for the half marathon', true],
    ]);
    expect(brief.cast.map((c) => c.name)).toEqual(['Aunt Rosa', 'Ben', 'Maya', 'Tom']);
  });

  it('drops ids that reference nothing known', () => {
    const brief = weekBrief(week('references to unknown storylines and cast').input);
    for (const m of brief.moments) {
      expect(m.storylineIds).toEqual([]);
      expect(m.castIds).toEqual([]);
    }
  });

  it('leaves transcripts out when nothing was derived yet', () => {
    const brief = weekBrief(week(NAMES.noDerived).input);
    expect(brief.moments).toHaveLength(4);
    expect(
      brief.moments.every((m) => m.transcript === undefined && m.questionText !== undefined),
    ).toBe(true);
  });
});
