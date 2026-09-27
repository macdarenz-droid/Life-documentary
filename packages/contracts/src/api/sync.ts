// Row sync (P6): POST /sync with a cursor, last-write-wins per row (D37). Device-only fields never
// leave the phone: a synced media asset has no local path, keys, poster or upload state, and a row that
// carries one fails to parse instead of being quietly trimmed.
import { z } from 'zod';
import { Documentary } from '../domain/documentary';
import { MediaAsset } from '../domain/mediaAsset';
import { Moment } from '../domain/moment';
import { Question } from '../domain/question';
import { CastMember, Storyline } from '../domain/storyline';
import { Uuid } from '../ids';

export const SyncedMediaAsset = z
  .object(MediaAsset.shape)
  .omit({
    localPath: true,
    wrappedKey: true,
    posterPath: true,
    posterWrappedKey: true,
    uploadState: true,
  })
  .strict()
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
export type SyncedMediaAsset = z.infer<typeof SyncedMediaAsset>;

export const SyncEntity = z.enum([
  'documentary',
  'moment',
  'mediaAsset',
  'question',
  'storyline',
  'castMember',
]);
export type SyncEntity = z.infer<typeof SyncEntity>;

export const SyncChange = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('documentary'), row: Documentary }),
  z.object({ entity: z.literal('moment'), row: Moment }),
  z.object({ entity: z.literal('mediaAsset'), row: SyncedMediaAsset }),
  z.object({ entity: z.literal('question'), row: Question }),
  z.object({ entity: z.literal('storyline'), row: Storyline }),
  z.object({ entity: z.literal('castMember'), row: CastMember }),
]);
export type SyncChange = z.infer<typeof SyncChange>;

export const SYNC_MAX_CHANGES = 100;

/** The cursor is the server's change log position; null on the first sync. */
export const SyncRequest = z.object({
  documentaryId: Uuid,
  cursor: z.number().int().min(0).nullable(),
  changes: z.array(SyncChange).max(SYNC_MAX_CHANGES),
});
export type SyncRequest = z.infer<typeof SyncRequest>;

export const SyncRefusal = z.object({
  entity: SyncEntity,
  id: Uuid,
  reason: z.enum(['stale', 'local_only', 'not_yours']),
});
export type SyncRefusal = z.infer<typeof SyncRefusal>;

export const SyncResponse = z.object({
  cursor: z.number().int().min(0),
  changes: z.array(SyncChange),
  refused: z.array(SyncRefusal),
});
export type SyncResponse = z.infer<typeof SyncResponse>;
