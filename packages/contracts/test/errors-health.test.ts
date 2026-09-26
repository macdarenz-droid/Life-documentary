import { describe, expect, it } from 'vitest';
import { ApiError, HealthResponse } from '../src';

describe('ApiError', () => {
  it('accepts a valid envelope', () => {
    expect(ApiError.safeParse({ error: { code: 'not_found', message: 'Not here.' } }).success).toBe(
      true,
    );
  });
  it('rejects an unknown code', () => {
    expect(
      ApiError.safeParse({ error: { code: 'teapot', message: 'Short and stout.' } }).success,
    ).toBe(false);
  });
});

describe('HealthResponse', () => {
  const valid = { status: 'ok', service: 'life-api', contractsVersion: 1, build: 'dev' };
  it('accepts a valid body', () => {
    expect(HealthResponse.safeParse(valid).success).toBe(true);
  });
  it('rejects another contracts version', () => {
    expect(HealthResponse.safeParse({ ...valid, contractsVersion: 2 }).success).toBe(false);
  });
});
