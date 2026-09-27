import { describe, expect, it } from 'vitest';
import { NOTE_MAX_LENGTH, durationLabel, timeLabel } from '../src';

describe('timeLabel', () => {
  it('reads the same instant on each moment’s own clock, 24-hour', () => {
    expect(timeLabel('2027-03-15T08:41:00Z', 'Europe/Berlin')).toBe('09:41');
    expect(timeLabel('2027-03-15T08:41:00Z', 'America/New_York')).toBe('04:41');
    expect(timeLabel('2027-03-15T22:05:00Z', 'Europe/Berlin')).toBe('23:05');
  });

  it('follows a zone across its clock change', () => {
    // Berlin moves from UTC+1 to UTC+2 on 2027-03-28 at 01:00 UTC.
    expect(timeLabel('2027-03-28T00:30:00Z', 'Europe/Berlin')).toBe('01:30');
    expect(timeLabel('2027-03-28T01:30:00Z', 'Europe/Berlin')).toBe('03:30');
  });

  it('writes midnight as 00', () => {
    expect(timeLabel('2027-03-14T23:00:00Z', 'Europe/Berlin')).toBe('00:00');
  });
});

describe('durationLabel', () => {
  it('rounds whole seconds down', () => {
    expect(durationLabel(9000)).toBe('0:09');
    expect(durationLabel(9999)).toBe('0:09');
    expect(durationLabel(59_999)).toBe('0:59');
    expect(durationLabel(60_000)).toBe('1:00');
    expect(durationLabel(61_500)).toBe('1:01');
  });

  it('never reads below 0:01 for a positive duration', () => {
    expect(durationLabel(1)).toBe('0:01');
    expect(durationLabel(999)).toBe('0:01');
    expect(durationLabel(0)).toBe('0:00');
  });
});

describe('NOTE_MAX_LENGTH', () => {
  it('is the Note tray limit', () => {
    expect(NOTE_MAX_LENGTH).toBe(280);
  });
});
