import { describe, expect, it } from 'vitest';
import { IanaTimeZone, LocalDate, Uuid } from '../src';

describe('Uuid', () => {
  it('accepts v4 and v7 UUIDs', () => {
    expect(Uuid.safeParse('3b241101-e2bb-4255-8caf-4136c566a962').success).toBe(true);
    expect(Uuid.safeParse('01890a5d-ac96-774b-bcce-b302099a8057').success).toBe(true);
  });
  it('rejects a non-UUID', () => {
    expect(Uuid.safeParse('abc').success).toBe(false);
  });
});

describe('LocalDate', () => {
  it.each(['2026-02-28', '2024-02-29'])('accepts %s', (value) => {
    expect(LocalDate.safeParse(value).success).toBe(true);
  });
  it.each(['2026-02-30', '2026-13-01', '26-01-01'])('rejects %s', (value) => {
    expect(LocalDate.safeParse(value).success).toBe(false);
  });
});

describe('IanaTimeZone', () => {
  it.each(['Europe/Dublin', 'Asia/Manila'])('accepts %s', (value) => {
    expect(IanaTimeZone.safeParse(value).success).toBe(true);
  });
  it('rejects an unknown zone', () => {
    expect(IanaTimeZone.safeParse('Mars/Olympus').success).toBe(false);
  });
});
