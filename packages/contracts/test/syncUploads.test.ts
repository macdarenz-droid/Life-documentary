import { describe, expect, it } from 'vitest';
import {
  CreateUploadResult,
  SyncedMediaAsset,
  SyncRequest,
  UPLOAD_PART_SIZE,
  UploadJob,
  UploadedPart,
  partCountFor,
} from '../src';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const synced = {
  id: ID(1),
  ownerUserId: ID(2),
  kind: 'photo',
  width: 3024,
  height: 4032,
  bytes: 2_000_000,
  sha256: 'a'.repeat(64),
  createdAt: '2027-03-15T08:14:00Z',
};

const request = (changes: unknown[]) => ({ documentaryId: ID(3), cursor: null, changes });

describe('SyncedMediaAsset', () => {
  it('holds the fields that may leave the phone', () => {
    expect(SyncedMediaAsset.parse(synced)).toEqual(synced);
  });

  it.each(['localPath', 'wrappedKey', 'posterPath', 'posterWrappedKey', 'uploadState'])(
    'refuses a row carrying %s instead of dropping it',
    (field) => {
      expect(SyncedMediaAsset.safeParse({ ...synced, [field]: 'x' }).success).toBe(false);
    },
  );
});

describe('SyncRequest', () => {
  const storyline = {
    entity: 'storyline',
    row: {
      id: ID(4),
      documentaryId: ID(3),
      title: 'The new job',
      openedAt: '2027-03-01T09:00:00Z',
      updatedAt: '2027-03-15T08:14:00Z',
    },
  };

  it('takes up to 100 changes and refuses 101', () => {
    const one = SyncRequest.safeParse(request([storyline]));
    expect(one.success, JSON.stringify(one.error?.issues)).toBe(true);
    expect(SyncRequest.safeParse(request(Array(100).fill(storyline))).success).toBe(true);
    expect(SyncRequest.safeParse(request(Array(101).fill(storyline))).success).toBe(false);
  });

  it('refuses a media asset change carrying its local path', () => {
    expect(SyncRequest.safeParse(request([{ entity: 'mediaAsset', row: synced }])).success).toBe(
      true,
    );
    expect(
      SyncRequest.safeParse(
        request([{ entity: 'mediaAsset', row: { ...synced, localPath: 'media/1.enc' } }]),
      ).success,
    ).toBe(false);
  });
});

describe('uploads', () => {
  it('takes a stored part only with a part number and a non-empty etag', () => {
    expect(UploadedPart.parse({ partNumber: 1, etag: 'e1' })).toEqual({
      partNumber: 1,
      etag: 'e1',
    });
    expect(UploadedPart.safeParse({ partNumber: 1, etag: '' }).success).toBe(false);
    expect(UploadedPart.safeParse({ partNumber: 0, etag: 'e1' }).success).toBe(false);
  });

  it('counts parts: none for an empty file, 2 for 5 MiB and one byte', () => {
    expect(() => partCountFor(0)).toThrow(RangeError);
    expect(partCountFor(1)).toBe(1);
    expect(partCountFor(UPLOAD_PART_SIZE)).toBe(1);
    expect(partCountFor(UPLOAD_PART_SIZE + 1)).toBe(2);
    expect(
      CreateUploadResult.safeParse({ uploadId: 'u1', partSize: UPLOAD_PART_SIZE, partCount: 0 })
        .success,
    ).toBe(false);
    expect(
      CreateUploadResult.parse({
        uploadId: 'u1',
        partSize: UPLOAD_PART_SIZE,
        partCount: partCountFor(UPLOAD_PART_SIZE + 1),
      }).partCount,
    ).toBe(2);
  });

  it('keeps a job purpose', () => {
    const job = {
      assetId: ID(1),
      purpose: 'preview',
      state: 'pending',
      parts: [],
      bytesDone: 0,
      attempts: 0,
      updatedAt: '2027-03-15T08:14:00Z',
    };
    expect(UploadJob.parse(job).purpose).toBe('preview');
    expect(UploadJob.safeParse({ ...job, purpose: 'thumbnail' }).success).toBe(false);
  });
});
