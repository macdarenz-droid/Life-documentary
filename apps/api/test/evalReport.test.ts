import { PlannerOutput, type WeekBriefV1 } from '@life/contracts';
import {
  CLOSING_MS,
  TITLE_CARD_MS,
  assemblePlan,
  isMediaMoment,
  planEligibility,
  shotMs,
  weekBrief,
} from '@life/story';
import { fixtureWeeks } from '@life/story/fixtures';
import { beforeEach, describe, expect, it } from 'vitest';
import { evalRow, evaluateWeeks, passes, reportTable } from '../src/pipeline/plan/evalReport';
import type { PlanOnceResult } from '../src/pipeline/plan/planOnce';
import type { PlanUsage } from '../src/pipeline/ports';
import { fixtures } from '../src/providers/fixture';

beforeEach(() => fixtures.reset());

const HEADINGS = ['The start', 'The middle', 'Later on', 'Near the end', 'The end'];
const MAX_MS = 240_000;

/** A plan a careful planner could give: every media moment in order, as many as fit in 240 s. */
function outputFor(brief: WeekBriefV1, title = 'The water and the new desk'): PlannerOutput {
  const media = brief.moments.filter(isMediaMoment);
  const answers = media.filter((m) => m.kind === 'answer');
  const cold = answers.reduce((a, b) => (shotMs(b) > shotMs(a) ? b : a));
  let total = shotMs(cold) + TITLE_CARD_MS + CLOSING_MS;
  const shots: string[] = [];
  for (const m of media) {
    if (shots.length < 30 && total + shotMs(m) <= MAX_MS) {
      shots.push(m.momentId);
      total += shotMs(m);
    }
  }
  const sceneCount = Math.min(5, Math.max(3, Math.ceil(shots.length / 6)));
  const scenes = HEADINGS.slice(0, sceneCount).map((heading, i) => ({
    heading,
    shots: shots
      .slice(
        Math.floor((i * shots.length) / sceneCount),
        Math.floor(((i + 1) * shots.length) / sceneCount),
      )
      .map((momentId) => ({ momentId })),
  }));
  return PlannerOutput.parse({
    title,
    coldOpen: { momentId: cold.momentId },
    scenes,
    closing: { momentId: shots.at(-1) },
    musicMood: 'calm',
    lowerThirds: [],
    summary: 'They recorded the week and went down to the water.',
  });
}

const usage: PlanUsage = {
  inputTokens: 18_000,
  outputTokens: 2500,
  cacheWriteTokens: 0,
  cacheReadTokens: 1300,
};

const briefOf = (name: string) => {
  const week = fixtureWeeks().find((w) => w.name === name)!;
  return weekBrief({ ...week.input, episodeNumber: 1, previousSummaries: [] });
};

const modelResult = (brief: WeekBriefV1, title?: string): PlanOnceResult => ({
  outcome: 'model',
  plan: assemblePlan(outputFor(brief, title), brief, { narratorVoiceId: 'narrator-1' }),
  usage,
  calls: 1,
});

describe('evalRow and passes', () => {
  it('passes a model plan with every property and counts its tokens and µUSD', () => {
    const brief = briefOf('full week');
    const row = evalRow('full week', brief, modelResult(brief));
    expect(row).toMatchObject({
      expected: 'model',
      outcome: 'model',
      calls: 1,
      tokens: 21_800,
      microUsd: 61_260,
    });
    expect(row.properties).toMatchObject({ valid: true, titleNotGeneric: true, userVoiceShare: 1 });
    expect(passes(row)).toBe(true);
  });

  it('fails a model plan with a generic title', () => {
    const brief = briefOf('full week');
    const row = evalRow('full week', brief, modelResult(brief, 'My week'));
    expect(row.properties?.titleNotGeneric).toBe(false);
    expect(passes(row)).toBe(false);
  });

  it('fails an eligible week that got no model plan', () => {
    const brief = briefOf('full week');
    const row = evalRow('full week', brief, {
      outcome: 'invalid',
      errors: ['The answer was not JSON.'],
      usage,
      calls: 2,
    });
    expect(row).toMatchObject({ outcome: 'invalid', calls: 2 });
    expect(row.properties).toBeUndefined();
    expect(passes(row)).toBe(false);
  });

  it('passes a recap week with no model call, and fails one that was called', () => {
    const brief = briefOf('photos only');
    const row = evalRow('photos only', brief);
    expect(row).toMatchObject({ expected: 'recap', outcome: 'none', calls: 0, microUsd: 0 });
    expect(passes(row)).toBe(true);
    expect(
      passes(evalRow('photos only', brief, { outcome: 'refused', errors: [], usage, calls: 1 })),
    ).toBe(false);
  });

  it('passes an empty week with nothing', () => {
    const row = evalRow('notes only', briefOf('notes only'));
    expect(row).toMatchObject({ expected: 'empty', outcome: 'none', tokens: 0, microUsd: 0 });
    expect(passes(row)).toBe(true);
  });
});

describe('the evaluation report', () => {
  it('has a row per fixture week with its eligibility, and a totals line counting the passes', async () => {
    const weeks = fixtureWeeks();
    const briefs = weeks.map((w) =>
      weekBrief({ ...w.input, episodeNumber: 1, previousSummaries: [] }),
    );
    for (const brief of briefs) {
      if (planEligibility(brief) === 'model') {
        fixtures.planner.answers.push({
          text: JSON.stringify(outputFor(brief)),
          stopReason: 'end_turn',
          usage,
        });
      }
    }
    const rows = await evaluateWeeks(weeks, fixtures.planner);
    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.expected)).toEqual(briefs.map(planEligibility));
    const expected = Object.fromEntries(rows.map((r) => [r.week, r.expected]));
    expect(expected['photos only']).toBe('recap');
    expect(expected['clips only']).toBe('recap');
    expect(expected['quiet week']).toBe('empty');
    expect(expected['notes only']).toBe('empty');
    // Every eligible week got one call and a model plan; the rest got none.
    for (const row of rows) {
      expect(row.calls).toBe(row.expected === 'model' ? 1 : 0);
      if (row.expected === 'model') expect(row.outcome).toBe('model');
    }
    const passed = rows.filter(passes).length;
    const table = reportTable(rows);
    expect(
      table.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Week')),
    ).toHaveLength(20);
    const total = rows.reduce((sum, r) => sum + r.microUsd, 0);
    expect(table).toContain(`Passed ${passed} of 20 weeks. Total ${total} µUSD.`);
    expect(fixtures.planner.calls.every((c) => c.effort === 'medium')).toBe(true);
  });
});
