import { Uuid } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import {
  dueWeeks,
  episodeTimes,
  episodeWeek,
  episodeWords,
  hourLabel,
  weekStatus,
  type ScheduledDocumentary,
} from '../src';

const BERLIN = Uuid.parse('11111111-1111-4111-8111-111111111111');

function doc(overrides: Partial<ScheduledDocumentary> = {}): ScheduledDocumentary {
  return { id: BERLIN, timeZone: 'Europe/Berlin', episodeDay: 0, episodeHour: 18, ...overrides };
}

describe('episodeWeek', () => {
  it('gives the previous Sunday to Saturday for a Sunday', () => {
    expect(episodeWeek('2026-10-11')).toEqual({ weekStart: '2026-10-04', weekEnd: '2026-10-10' });
  });
});

describe('episodeTimes', () => {
  it('starts at 06:00, renders 15 minutes before and delivers at the hour on a normal Berlin Sunday', () => {
    expect(episodeTimes(doc(), '2026-10-11')).toEqual({
      startAt: '2026-10-11T04:00:00.000Z',
      renderAt: '2026-10-11T15:45:00.000Z',
      deliverAt: '2026-10-11T16:00:00.000Z',
    });
  });

  it('uses the new offset on the Sunday the clocks go forward', () => {
    expect(episodeTimes(doc(), '2026-03-29')).toEqual({
      startAt: '2026-03-29T04:00:00.000Z',
      renderAt: '2026-03-29T15:45:00.000Z',
      deliverAt: '2026-03-29T16:00:00.000Z',
    });
  });

  it('uses the new offset on the Sunday the clocks go back', () => {
    expect(episodeTimes(doc(), '2026-10-25')).toEqual({
      startAt: '2026-10-25T05:00:00.000Z',
      renderAt: '2026-10-25T16:45:00.000Z',
      deliverAt: '2026-10-25T17:00:00.000Z',
    });
  });

  it('moves a missing 02:00 on the spring-forward Sunday to 03:00 CEST', () => {
    expect(episodeTimes(doc({ episodeHour: 2 }), '2026-03-29')).toEqual({
      startAt: '2026-03-29T00:00:00.000Z',
      renderAt: '2026-03-29T00:45:00.000Z',
      deliverAt: '2026-03-29T01:00:00.000Z',
    });
  });

  it('takes the first of a repeated 02:00 on the fall-back Sunday', () => {
    expect(episodeTimes(doc({ episodeHour: 2 }), '2026-10-25').deliverAt).toBe(
      '2026-10-25T00:00:00.000Z',
    );
  });

  it('handles quarter-hour, half-hour and +14 offsets', () => {
    expect(episodeTimes(doc({ timeZone: 'Asia/Kathmandu' }), '2026-10-11')).toEqual({
      startAt: '2026-10-11T00:15:00.000Z',
      renderAt: '2026-10-11T12:00:00.000Z',
      deliverAt: '2026-10-11T12:15:00.000Z',
    });
    expect(episodeTimes(doc({ timeZone: 'America/St_Johns' }), '2026-12-06')).toEqual({
      startAt: '2026-12-06T09:30:00.000Z',
      renderAt: '2026-12-06T21:15:00.000Z',
      deliverAt: '2026-12-06T21:30:00.000Z',
    });
    expect(episodeTimes(doc({ timeZone: 'Pacific/Kiritimati' }), '2026-10-11')).toEqual({
      startAt: '2026-10-10T16:00:00.000Z',
      renderAt: '2026-10-11T03:45:00.000Z',
      deliverAt: '2026-10-11T04:00:00.000Z',
    });
  });

  it('starts an hour before an early hour, and all at once at midnight', () => {
    expect(episodeTimes(doc({ episodeHour: 5 }), '2026-10-11')).toEqual({
      startAt: '2026-10-11T02:00:00.000Z',
      renderAt: '2026-10-11T02:45:00.000Z',
      deliverAt: '2026-10-11T03:00:00.000Z',
    });
    expect(episodeTimes(doc({ episodeHour: 0 }), '2026-10-11')).toEqual({
      startAt: '2026-10-10T22:00:00.000Z',
      renderAt: '2026-10-10T22:00:00.000Z',
      deliverAt: '2026-10-10T22:00:00.000Z',
    });
  });
});

describe('dueWeeks', () => {
  const due = (now: string, documentaries = [doc()]) =>
    dueWeeks(documentaries, now).map((w) => `${w.documentaryId} ${w.deliveryDate}`);

  it('is due at startAt and not one minute before', () => {
    expect(due('2026-10-11T03:59:00.000Z')).toEqual([]);
    expect(dueWeeks([doc()], '2026-10-11T04:00:00.000Z')).toEqual([
      {
        documentaryId: BERLIN,
        deliveryDate: '2026-10-11',
        weekStart: '2026-10-04',
        weekEnd: '2026-10-10',
        startAt: '2026-10-11T04:00:00.000Z',
        renderAt: '2026-10-11T15:45:00.000Z',
        deliverAt: '2026-10-11T16:00:00.000Z',
      },
    ]);
  });

  it('is still due 2 h 59 min after deliverAt and not at 3 h', () => {
    expect(due('2026-10-11T18:59:00.000Z')).toEqual([`${BERLIN} 2026-10-11`]);
    expect(due('2026-10-11T19:00:00.000Z')).toEqual([]);
  });

  it('keeps an 11pm week due on the next local day until 02:00', () => {
    const late = [doc({ episodeHour: 23 })];
    expect(due('2026-10-11T23:59:00.000Z', late)).toEqual([`${BERLIN} 2026-10-11`]);
    expect(due('2026-10-12T00:00:00.000Z', late)).toEqual([]);
  });

  it('is due from midnight for hour 0', () => {
    const midnight = [doc({ episodeHour: 0 })];
    expect(due('2026-10-10T21:59:00.000Z', midnight)).toEqual([]);
    expect(due('2026-10-10T22:00:00.000Z', midnight)).toEqual([`${BERLIN} 2026-10-11`]);
  });

  it('is not due on another weekday', () => {
    expect(due('2026-10-11T12:00:00.000Z', [doc({ episodeDay: 3 })])).toEqual([]);
  });

  it('works out each documentary in its own zone at the same instant', () => {
    const tokyo = doc({
      id: Uuid.parse('22222222-2222-4222-8222-222222222222'),
      timeZone: 'Asia/Tokyo',
      episodeHour: 20,
    });
    const newYork = doc({
      id: Uuid.parse('33333333-3333-4333-8333-333333333333'),
      timeZone: 'America/New_York',
    });
    const kiritimati = doc({
      id: Uuid.parse('44444444-4444-4444-8444-444444444444'),
      timeZone: 'Pacific/Kiritimati',
    });
    expect(due('2026-10-11T12:00:00.000Z', [doc(), tokyo, newYork, kiritimati])).toEqual([
      `${BERLIN} 2026-10-11`,
      `${tokyo.id} 2026-10-11`,
      `${newYork.id} 2026-10-11`,
    ]);
  });
});

describe('weekStatus', () => {
  const documentary = { ...doc(), createdAt: '2026-09-01T10:00:00.000Z' };
  const week = '2026-10-04';

  it('is none before any week of the documentary has started', () => {
    const fresh = { ...documentary, createdAt: '2026-10-08T10:00:00.000Z' };
    expect(weekStatus(fresh, '2026-10-11T03:59:00.000Z')).toBe('none');
    expect(weekStatus(fresh, '2026-10-11T04:00:00.000Z')).toBe('making');
  });

  it('is making from startAt until the hour', () => {
    expect(weekStatus(documentary, '2026-10-11T10:00:00.000Z')).toBe('making');
    expect(
      weekStatus(documentary, '2026-10-11T15:59:00.000Z', { weekStart: week, state: 'rendering' }),
    ).toBe('making');
  });

  it('is ready once the episode is ready', () => {
    expect(
      weekStatus(documentary, '2026-10-11T16:00:00.000Z', { weekStart: week, state: 'ready' }),
    ).toBe('ready');
    expect(
      weekStatus(documentary, '2026-10-14T09:00:00.000Z', { weekStart: week, state: 'ready' }),
    ).toBe('ready');
  });

  it('is failed when the episode failed', () => {
    expect(
      weekStatus(documentary, '2026-10-11T17:00:00.000Z', { weekStart: week, state: 'failed' }),
    ).toBe('failed');
  });

  it('is late once the hour has passed and it is not ready', () => {
    expect(weekStatus(documentary, '2026-10-11T16:00:00.000Z')).toBe('late');
    expect(
      weekStatus(documentary, '2026-10-11T22:00:00.000Z', { weekStart: week, state: 'rendering' }),
    ).toBe('late');
  });

  it('is quiet 3 hours after the hour with no summary', () => {
    expect(weekStatus(documentary, '2026-10-11T18:59:00.000Z')).toBe('late');
    expect(weekStatus(documentary, '2026-10-11T19:00:00.000Z')).toBe('quiet');
    expect(weekStatus(documentary, '2026-10-14T09:00:00.000Z')).toBe('quiet');
  });

  it("ignores another week's summary", () => {
    expect(
      weekStatus(documentary, '2026-10-11T10:00:00.000Z', {
        weekStart: '2026-09-27',
        state: 'ready',
      }),
    ).toBe('making');
  });
});

describe('the delivery words', () => {
  it('names the hour plainly', () => {
    expect([0, 9, 12, 18].map(hourLabel)).toEqual(['midnight', '9am', 'noon', '6pm']);
    expect(episodeWords.making(18)).toBe(
      "This week's episode is being made. It'll be here by 6pm.",
    );
    expect(episodeWords.ready(12)).toBe('Episode 12 is ready');
  });
});
