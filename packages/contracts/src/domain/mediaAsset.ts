import { z } from 'zod';
import { Timestamp, Uuid } from '../ids';

export const MediaAsset = z
  .object({
    id: Uuid,
    ownerUserId: Uuid,
    kind: z.enum(['video', 'photo', 'audio']),
    durationMs: z.number().int().min(1).optional(),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
    bytes: z.number().int().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    localPath: z.string().min(1),
    /** The per-file key, wrapped by the master key, base64. */
    wrappedKey: z.string().min(1),
    cloudKey: z.string().min(1).optional(),
    uploadState: z.enum(['local', 'queued', 'uploading', 'uploaded']),
    createdAt: Timestamp,
  })
  .superRefine((a, ctx) => {
    if (a.kind !== 'photo' && a.durationMs === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMs'],
        message: `A ${a.kind} needs its duration`,
      });
    }
    if (a.kind !== 'audio') {
      if (a.width === undefined) {
        ctx.addIssue({ code: 'custom', path: ['width'], message: `A ${a.kind} needs its width` });
      }
      if (a.height === undefined) {
        ctx.addIssue({ code: 'custom', path: ['height'], message: `A ${a.kind} needs its height` });
      }
    }
  });
export type MediaAsset = z.infer<typeof MediaAsset>;
