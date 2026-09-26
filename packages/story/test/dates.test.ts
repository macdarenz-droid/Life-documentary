import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, daysBetween, isWeekend, oneYearBefore } from '../src';

describe('dates', () => {
  it('addDays crosses years and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-09-26', 0)).toBe('2026-09-26');
  });

  it('daysBetween counts whole days, negative when b is earlier', () => {
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
    expect(daysBetween('2026-03-01', '2026-01-01')).toBe(-59);
    // across a daylight-saving change in most zones: still whole days
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('dayOfWeek and isWeekend', () => {
    expect(dayOfWeek('2026-09-26')).toBe(6);
    expect(dayOfWeek('2026-09-27')).toBe(0);
    expect(isWeekend('2026-09-26')).toBe(true);
    expect(isWeekend('2026-09-27')).toBe(true);
    expect(isWeekend('2026-09-28')).toBe(false);
  });

  it('oneYearBefore keeps month and day, 29 February becomes 28 February', () => {
    expect(oneYearBefore('2027-09-26')).toBe('2026-09-26');
    expect(oneYearBefore('2028-02-29')).toBe('2027-02-28');
    expect(oneYearBefore('2029-03-01')).toBe('2028-03-01');
  });
});
