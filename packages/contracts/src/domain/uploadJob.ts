import { z } from 'zod';
import { UploadPurpose } from '../api/uploads';
import { Timestamp, Uuid } from '../ids';
import { isUnique } from './unique';

export const UploadJob = z.object({
  assetId: Uuid,
  /** What the file goes up for (P6). Optional until the device table has the column (T-011e). */
  purpose: UploadPurpose.optional(),
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
