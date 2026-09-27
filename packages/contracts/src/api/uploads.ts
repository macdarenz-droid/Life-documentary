// Media uploads (P6): 5 MiB parts streamed through the Worker into R2 (D34). Parsed on the phone and in
// the Worker (CLAUDE.md rule 3).
import { z } from 'zod';
import { Uuid } from '../ids';

/**
 * What a file is uploaded for: the service's working copies (answer, preview, keyframe) or a full
 * original.
 */
export const UploadPurpose = z.enum(['answer', 'preview', 'keyframe', 'original']);
export type UploadPurpose = z.infer<typeof UploadPurpose>;

/** Every part but the last is exactly this size; R2 needs at least 5 MiB for them. */
export const UPLOAD_PART_SIZE = 5_242_880;

/** Parts for a file of `bytes`; a file has at least one byte. */
export function partCountFor(bytes: number): number {
  if (!Number.isInteger(bytes) || bytes < 1) throw new RangeError('A file has at least one byte');
  return Math.ceil(bytes / UPLOAD_PART_SIZE);
}

/** POST /uploads: starts one multipart upload. */
export const CreateUpload = z.object({
  assetId: Uuid,
  purpose: UploadPurpose,
  contentType: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/),
  bytes: z.number().int().min(1),
});
export type CreateUpload = z.infer<typeof CreateUpload>;

export const CreateUploadResult = z.object({
  uploadId: z.string().min(1),
  partSize: z.literal(UPLOAD_PART_SIZE),
  partCount: z.number().int().min(1),
});
export type CreateUploadResult = z.infer<typeof CreateUploadResult>;

/** A stored part, as the part route answers and the completion lists it. */
export const UploadedPart = z.object({
  partNumber: z.number().int().min(1),
  etag: z.string().min(1),
});
export type UploadedPart = z.infer<typeof UploadedPart>;

export const CompleteUpload = z.object({
  parts: z.array(UploadedPart).min(1),
});
export type CompleteUpload = z.infer<typeof CompleteUpload>;

export const UploadDone = z.object({ cloudKey: z.string().min(1) });
export type UploadDone = z.infer<typeof UploadDone>;
