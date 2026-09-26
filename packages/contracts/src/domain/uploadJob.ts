import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';
import { isUnique } from './unique';

export const UploadJob = z.object({
  assetId: Uuid,
  state: z.enum(['pending', 'uploading', 'completing', 'done', 'failed']),
  uploadId: z.string().min(1).optional(),
  parts: z
    .array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) }))
    .refine((parts) => isUnique(parts.map((p) => p.partNumber)), {
      message: 'Duplicate part number',
    }),
  bytesDone: z.number().int().min(0),
  attempts: z.number().int().min(0),
  nextAttemptAt: Timestamp.optional(),
  updatedAt: Timestamp,
});
export type UploadJob = z.infer<typeof UploadJob>;
