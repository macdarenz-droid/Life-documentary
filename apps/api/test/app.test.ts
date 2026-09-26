import { ApiError, HealthResponse } from '@life/contracts';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('api app', () => {
  it('GET /health returns the typed health body', async () => {
    const res = await createApp().request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = HealthResponse.parse(await res.json());
    expect(body.build).toBe(env.BUILD);
  });

  it('unknown routes return a not_found error envelope', async () => {
    const res = await createApp().request('/nope', {}, env);
    expect(res.status).toBe(404);
    const body = ApiError.parse(await res.json());
    expect(body.error.code).toBe('not_found');
  });

  it('a throwing route returns internal without leaking the error text', async () => {
    const app = createApp();
    app.get('/boom', () => {
      throw new Error('secret failure detail');
    });
    const res = await app.request('/boom', {}, env);
    expect(res.status).toBe(500);
    const body = ApiError.parse(await res.json());
    expect(body.error.code).toBe('internal');
    expect(body.error.message).not.toContain('secret failure detail');
  });
});
