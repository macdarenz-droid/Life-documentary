import { CONTRACTS_VERSION, HealthResponse } from '@life/contracts';
import { Hono } from 'hono';
import type { Env } from '../shared/env';

export const health = new Hono<{ Bindings: Env }>().get('/health', (c) =>
  c.json(
    HealthResponse.parse({
      status: 'ok',
      service: 'life-api',
      contractsVersion: CONTRACTS_VERSION,
      build: c.env.BUILD,
    }),
    200,
  ),
);
