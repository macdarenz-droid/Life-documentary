import { describe, expect, it } from 'vitest';
import { Me, RegisterDevice } from '../src';

const ID = '3f2a8c1e-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

describe('RegisterDevice', () => {
  it('accepts an ios or android phone and refuses another platform', () => {
    expect(RegisterDevice.safeParse({ id: ID, platform: 'ios', appVersion: '1.0.0' }).success).toBe(
      true,
    );
    expect(RegisterDevice.safeParse({ id: ID, platform: 'web', appVersion: '1.0.0' }).success).toBe(
      false,
    );
  });
});

describe('Me', () => {
  it('holds an open deletion request or null', () => {
    const base = { userId: ID, email: 'ada@example.com', documentaries: [] };
    expect(Me.safeParse({ ...base, deletion: null }).success).toBe(true);
    expect(
      Me.safeParse({ ...base, deletion: { purgeAfter: '2027-04-14T09:30:00.000Z' } }).success,
    ).toBe(true);
    expect(Me.safeParse({ ...base, email: 'not an address', deletion: null }).success).toBe(false);
  });
});
