import { systemClock } from './systemClock';

describe('systemClock', () => {
  afterEach(() => jest.useRealTimers());

  it('gives the local date in a time zone for a fixed instant', () => {
    jest.useFakeTimers({ now: new Date('2026-10-24T23:30:00Z') });
    expect(systemClock.now()).toBe('2026-10-24T23:30:00.000Z');
    expect(systemClock.today('Asia/Manila')).toBe('2026-10-25');
    expect(systemClock.today('Europe/Dublin')).toBe('2026-10-25');
    jest.setSystemTime(new Date('2026-10-25T23:30:00Z'));
    expect(systemClock.today('Europe/Dublin')).toBe('2026-10-25');
  });
});
