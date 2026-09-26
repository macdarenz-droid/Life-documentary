import { Moment } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import { isShareable, localDay } from '../src';

const moment = Moment.parse({
  id: '00000000-0000-4000-8000-000000000001',
  documentaryId: '00000000-0000-4000-8000-000000000002',
  authorUserId: '00000000-0000-4000-8000-000000000003',
  capturedAt: '2027-03-01T12:00:00Z',
  timeZone: 'Europe/Berlin',
  kind: 'note',
  text: 'A slow morning.',
  localOnly: false,
  storylineIds: [],
  castIds: [],
  updatedAt: '2027-03-01T12:00:00Z',
});

describe('isShareable', () => {
  it('is false for a local-only moment', () => {
    expect(isShareable({ ...moment, localOnly: true })).toBe(false);
  });
  it('is false for a deleted moment', () => {
    expect(isShareable({ ...moment, deletedAt: '2027-03-02T12:00:00Z' })).toBe(false);
  });
  it('is true otherwise', () => {
    expect(isShareable(moment)).toBe(true);
  });
});

describe('localDay', () => {
  it('reads the local calendar day across the October DST change', () => {
    expect(localDay('2026-10-24T23:30:00Z', 'Europe/Dublin')).toBe('2026-10-25');
    expect(localDay('2026-10-24T23:30:00Z', 'Asia/Manila')).toBe('2026-10-25');
    expect(localDay('2026-10-25T23:30:00Z', 'Europe/Dublin')).toBe('2026-10-25');
  });
});
