import { z } from 'zod';

export const HealthResponse = z.object({
  status: z.literal('ok'),
  service: z.literal('life-api'),
  contractsVersion: z.literal(1),
  build: z.string().min(1),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
