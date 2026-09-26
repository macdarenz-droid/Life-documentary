import { QuestionPick, Uuid, type LocalDate, type QuestionTemplate } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  pickQuestion,
  questionTemplates,
  type QuestionContext,
} from '../src';
import {
  anniversaryDates,
  isQuietDay,
  quietStretches,
  runSimulatedYear,
  storylines,
} from './fixtures/simulatedYear';

const MONDAY = '2027-03-15';
const SATURDAY = '2027-03-20';
const jobId = Uuid.parse('00000000-0000-4000-8000-00000000000a');
const runId = Uuid.parse('00000000-0000-4000-8000-00000000000b');

function busyWeek(today: LocalDate): QuestionContext['recentDays'][number][] {
  return [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    date: addDays(today, -n),
    momentCount: 2,
    placeNames: ['Home'],
    castNames: [],
  }));
}

function context(overrides: Partial<QuestionContext> = {}): QuestionContext {
  const today = overrides.today ?? MONDAY;
  return {
    today,
    seed: 'doc-1',
    templates: questionTemplates,
    openStorylines: [],
    recentDays: busyWeek(today),
    placesBefore: ['Home'],
    momentsOneYearAgo: 0,
    history: [],
    ...overrides,
  };
}

function withYesterday(today: LocalDate, patch: { placeNames?: string[]; castNames?: string[] }) {
  return busyWeek(today).map((d) => (d.date === addDays(today, -1) ? { ...d, ...patch } : d));
}

function templateOf(id: string): QuestionTemplate {
  const template = questionTemplates.find((t) => t.id === id);
  if (!template) throw new Error(`no template ${id}`);
  return template;
}

function idsTagged(tag: QuestionTemplate['tags'][number]): string[] {
  return questionTemplates.filter((t) => t.tags.includes(tag)).map((t) => t.id);
}

describe('pickQuestion rules', () => {
  it('three quiet days before today give after_quiet_days', () => {
    const recentDays = busyWeek(MONDAY).map((d) =>
      daysBetween(d.date, MONDAY) <= 3 ? { ...d, momentCount: 0 } : d,
    );
    expect(pickQuestion(context({ recentDays })).reason).toBe('after_quiet_days');
  });

  it('days missing from recentDays count as quiet', () => {
    expect(pickQuestion(context({ recentDays: [] })).reason).toBe('after_quiet_days');
  });

  it('moments one year ago give anniversary', () => {
    expect(pickQuestion(context({ momentsOneYearAgo: 3 })).reason).toBe('anniversary');
  });

  it('an open storyline gives open_storyline with its id and title', () => {
    const pick = pickQuestion(
      context({ openStorylines: [{ id: jobId, title: '  The new job ', openedOn: '2027-02-01' }] }),
    );
    expect(pick.reason).toBe('open_storyline');
    expect(pick.storylineId).toBe(jobId);
    expect(pick.text).toContain('The new job');
    expect(pick.text).not.toContain('  The new job');
  });

  it('a person seen yesterday gives person_seen with the alphabetically first name', () => {
    const pick = pickQuestion(
      context({ recentDays: withYesterday(MONDAY, { castNames: ['Tom', 'ben', 'Aunt Rosa'] }) }),
    );
    expect(pick.reason).toBe('person_seen');
    expect(pick.text).toContain('Aunt Rosa');
  });

  it('a place first seen yesterday gives place_first_time with that place', () => {
    const pick = pickQuestion(
      context({
        recentDays: withYesterday(MONDAY, { placeNames: ['Home', 'The harbour', 'Old mill'] }),
      }),
    );
    expect(pick.reason).toBe('place_first_time');
    expect(pick.text).toContain('Old mill');
  });

  it('a place seen earlier in the week is not new', () => {
    const recentDays = withYesterday(MONDAY, { placeNames: ['Old mill'] }).map((d) =>
      d.date === addDays(MONDAY, -4) ? { ...d, placeNames: ['Old mill'] } : d,
    );
    expect(pickQuestion(context({ recentDays })).reason).not.toBe('place_first_time');
  });

  it('otherwise a Monday draws from the weekday pool', () => {
    const tags = templateOf(pickQuestion(context()).templateId).tags;
    expect(tags.some((t) => ['general', 'season', 'weekday'].includes(t))).toBe(true);
    expect(tags).not.toContain('weekend');
  });

  it('otherwise a Saturday draws from the weekend pool', () => {
    const tags = templateOf(pickQuestion(context({ today: SATURDAY })).templateId).tags;
    expect(tags.some((t) => ['general', 'season', 'weekend'].includes(t))).toBe(true);
    expect(tags).not.toContain('weekday');
  });
});

describe('storylines', () => {
  const both = [
    { id: jobId, title: 'The new job', openedOn: '2027-02-01' },
    { id: runId, title: 'Training for the half marathon', openedOn: '2027-01-01' },
  ];

  it('chooses the open storyline asked least recently', () => {
    const history = [
      { askedOn: addDays(MONDAY, -5), templateId: 'q001', storylineId: jobId },
      { askedOn: addDays(MONDAY, -10), templateId: 'q002', storylineId: runId },
    ];
    const pick = pickQuestion(context({ openStorylines: both, history }));
    expect(pick.storylineId).toBe(runId);
  });

  it('a storyline question yesterday blocks the storyline rule today', () => {
    const history = [{ askedOn: addDays(MONDAY, -1), templateId: 'q001', storylineId: jobId }];
    expect(pickQuestion(context({ openStorylines: both, history })).reason).not.toBe(
      'open_storyline',
    );
  });

  it('two storyline questions in the previous 6 days block the storyline rule', () => {
    const history = [
      { askedOn: addDays(MONDAY, -3), templateId: 'q001', storylineId: jobId },
      { askedOn: addDays(MONDAY, -6), templateId: 'q002', storylineId: runId },
    ];
    expect(pickQuestion(context({ openStorylines: both, history })).reason).not.toBe(
      'open_storyline',
    );
  });

  it('falls through to the next rule when every storyline template was asked in the last 60 days', () => {
    const history = idsTagged('open_storyline').map((templateId, i) => ({
      askedOn: addDays(MONDAY, -(10 + i)),
      templateId,
    }));
    const pick = pickQuestion(
      context({
        openStorylines: both,
        history,
        recentDays: withYesterday(MONDAY, { castNames: ['Maya'] }),
      }),
    );
    expect(pick.reason).toBe('person_seen');
  });
});

describe('exhaustion and determinism', () => {
  it('with every day-pool template asked within 60 days, picks the one asked longest ago', () => {
    const pool = questionTemplates
      .filter((t) => t.tags.some((tag) => ['general', 'season', 'weekday'].includes(tag)))
      .map((t) => t.id)
      .sort();
    const oldest = pool[17] ?? '';
    const history = pool.map((templateId) => ({
      askedOn: addDays(
        MONDAY,
        templateId === oldest ? -59 : -(1 + (pool.indexOf(templateId) % 50)),
      ),
      templateId,
    }));
    expect(pickQuestion(context({ history })).templateId).toBe(oldest);
  });

  it('the same context gives the same pick', () => {
    const ctx = context({
      openStorylines: [{ id: jobId, title: 'The new job', openedOn: '2027-02-01' }],
    });
    expect(pickQuestion(ctx)).toEqual(pickQuestion({ ...ctx }));
  });

  it('changing only the seed changes at least one pick over the simulated year', () => {
    const a = runSimulatedYear('doc-a').map((p) => p.pick.templateId);
    const b = runSimulatedYear('doc-b').map((p) => p.pick.templateId);
    expect(a).not.toEqual(b);
  });
});

describe('a simulated year', () => {
  const picks = runSimulatedYear('documentary-2027');
  const reasonOn = new Map(picks.map((p) => [p.date, p.pick.reason]));

  it('gives 365 picks that each parse as QuestionPick with every slot filled', () => {
    expect(picks).toHaveLength(365);
    for (const { pick } of picks) {
      expect(() => QuestionPick.parse(pick)).not.toThrow();
      expect(pick.text).not.toMatch(/[{}]/);
    }
  });

  it('never repeats a template within 60 days', () => {
    const lastAsked = new Map<string, LocalDate>();
    for (const { date, pick } of picks) {
      const last = lastAsked.get(pick.templateId);
      if (last !== undefined) expect(daysBetween(last, date)).toBeGreaterThan(60);
      lastAsked.set(pick.templateId, date);
    }
  });

  it('asks after_quiet_days on the day after each quiet stretch', () => {
    for (const q of quietStretches) {
      expect(reasonOn.get(addDays(q.start, q.days))).toBe('after_quiet_days');
    }
  });

  it('asks anniversary on each of the 12 anniversary dates', () => {
    expect(anniversaryDates).toHaveLength(12);
    for (const date of anniversaryDates) expect(reasonOn.get(date)).toBe('anniversary');
  });

  it('follows storylines at most twice and, while one is open, at least once in every 7-day window', () => {
    const isOpen = (date: LocalDate) =>
      storylines.some((s) => s.openedOn <= date && date <= s.closedOn);
    for (let i = 0; i + 7 <= picks.length; i++) {
      const window = picks.slice(i, i + 7);
      const count = window.filter((p) => p.pick.reason === 'open_storyline').length;
      expect(count).toBeLessThanOrEqual(2);
      if (window.every((p) => isOpen(p.date) && !isQuietDay(p.date)))
        expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});
