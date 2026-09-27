import { describe, expect, it } from 'vitest';
import {
  CastMember,
  DOMAIN_SCHEMA_VERSION,
  Documentary,
  Episode,
  MediaAsset,
  Moment,
  Question,
  Storyline,
  Timestamp,
  UploadJob,
} from '../src';

const ID = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c'].map(
  (n) => `3b241101-e2bb-4255-8caf-4136c566a9${n.padStart(2, '0')}`,
);
const NOW = '2027-03-15T09:30:00Z';

const documentary = {
  id: ID[0],
  ownerUserId: ID[1],
  title: 'My year',
  kind: 'solo',
  timeZone: 'Europe/Berlin',
  createdAt: NOW,
  updatedAt: NOW,
};
const answer = {
  id: ID[2],
  documentaryId: ID[0],
  authorUserId: ID[1],
  capturedAt: NOW,
  timeZone: 'Europe/Berlin',
  kind: 'answer',
  questionId: ID[3],
  mediaAssetId: ID[4],
  mood: 'calm',
  placeName: 'The harbour',
  localOnly: false,
  storylineIds: [ID[5]],
  castIds: [ID[6]],
  updatedAt: NOW,
};
const note = {
  ...answer,
  kind: 'note',
  questionId: undefined,
  mediaAssetId: undefined,
  text: 'A slow morning.',
};
const video = {
  id: ID[4],
  ownerUserId: ID[1],
  kind: 'video',
  durationMs: 9_000,
  width: 1080,
  height: 1920,
  bytes: 4_200_000,
  sha256: 'a'.repeat(64),
  localPath: 'media/abc.enc',
  wrappedKey: 'd3JhcHBlZA==',
  uploadState: 'local',
  createdAt: NOW,
};
const question = {
  id: ID[3],
  documentaryId: ID[0],
  templateId: 'q001',
  reason: 'open_storyline',
  askedOn: '2027-03-15',
  storylineId: ID[5],
  text: 'Where are things with The new job this week?',
};
const storyline = {
  id: ID[5],
  documentaryId: ID[0],
  title: 'The new job',
  openedAt: '2027-02-01T08:00:00Z',
  closedAt: '2027-06-30T18:00:00Z',
  updatedAt: NOW,
};
const cast = {
  id: ID[6],
  documentaryId: ID[0],
  name: 'Maya',
  relation: 'sister',
  createdAt: NOW,
  updatedAt: NOW,
};
const episode = {
  id: ID[7],
  documentaryId: ID[0],
  number: 3,
  weekStart: '2027-03-08',
  weekEnd: '2027-03-14',
  state: 'ready',
  planVersion: 1,
  renderVersion: 1,
  mp4Key: 'episodes/3.mp4',
  durationMs: 120_000,
  costCents: 42,
  deliveredAt: NOW,
  updatedAt: NOW,
};
const uploadJob = {
  assetId: ID[4],
  state: 'uploading',
  uploadId: 'up-1',
  parts: [
    { partNumber: 1, etag: 'e1' },
    { partNumber: 2, etag: 'e2' },
  ],
  bytesDone: 1_000_000,
  attempts: 1,
  updatedAt: NOW,
};

describe('valid fixtures', () => {
  it('parse for every schema', () => {
    expect(Documentary.parse(documentary)).toMatchObject({ episodeDay: 0, episodeHour: 18 });
    expect(Moment.safeParse(answer).success).toBe(true);
    expect(Moment.safeParse(note).success).toBe(true);
    expect(Moment.safeParse({ ...answer, kind: 'clip', questionId: undefined }).success).toBe(true);
    expect(MediaAsset.safeParse(video).success).toBe(true);
    expect(
      MediaAsset.safeParse({ ...video, kind: 'audio', width: undefined, height: undefined })
        .success,
    ).toBe(true);
    expect(Question.safeParse(question).success).toBe(true);
    expect(Storyline.safeParse(storyline).success).toBe(true);
    expect(CastMember.safeParse(cast).success).toBe(true);
    expect(Episode.safeParse(episode).success).toBe(true);
    expect(UploadJob.safeParse(uploadJob).success).toBe(true);
    expect(DOMAIN_SCHEMA_VERSION).toBe(4);
  });
});

describe('rejections', () => {
  it('an answer without questionId', () => {
    expect(Moment.safeParse({ ...answer, questionId: undefined }).success).toBe(false);
  });
  it('a note with a mediaAssetId', () => {
    expect(Moment.safeParse({ ...note, mediaAssetId: ID[4] }).success).toBe(false);
  });
  it('a clip without media', () => {
    expect(Moment.safeParse({ ...answer, kind: 'clip', mediaAssetId: undefined }).success).toBe(
      false,
    );
  });
  it('11 storyline ids', () => {
    const storylineIds = Array.from(
      { length: 11 },
      (_, i) => `3b241101-e2bb-4255-8caf-4136c566b${String(i).padStart(3, '0')}`,
    );
    expect(Moment.safeParse({ ...answer, storylineIds }).success).toBe(false);
  });
  it('a duplicated cast id', () => {
    expect(Moment.safeParse({ ...answer, castIds: [ID[6], ID[6]] }).success).toBe(false);
  });
  it('a video without durationMs', () => {
    expect(MediaAsset.safeParse({ ...video, durationMs: undefined }).success).toBe(false);
  });
  it('a MediaAsset poster path without its wrapped key, or the key without the path', () => {
    expect(MediaAsset.safeParse({ ...video, posterPath: '/s/a.poster.lde' }).success).toBe(false);
    expect(MediaAsset.safeParse({ ...video, posterWrappedKey: 'a2V5' }).success).toBe(false);
    expect(
      MediaAsset.safeParse({ ...video, posterPath: '/s/a.poster.lde', posterWrappedKey: 'a2V5' })
        .success,
    ).toBe(true);
  });
  it('a sha256 of 63 characters or in uppercase hex', () => {
    expect(MediaAsset.safeParse({ ...video, sha256: 'a'.repeat(63) }).success).toBe(false);
    expect(MediaAsset.safeParse({ ...video, sha256: 'A'.repeat(64) }).success).toBe(false);
  });
  it('a Question with an unknown reason', () => {
    expect(Question.safeParse({ ...question, reason: 'mood_detected' }).success).toBe(false);
  });
  it('a Storyline closed before it opened', () => {
    expect(Storyline.safeParse({ ...storyline, closedAt: '2027-01-31T08:00:00Z' }).success).toBe(
      false,
    );
  });
  it('an Episode whose weekEnd is not weekStart + 6', () => {
    expect(Episode.safeParse({ ...episode, weekEnd: '2027-03-15' }).success).toBe(false);
  });
  it('an UploadJob with duplicate part numbers', () => {
    const parts = [
      { partNumber: 1, etag: 'e1' },
      { partNumber: 1, etag: 'e2' },
    ];
    expect(UploadJob.safeParse({ ...uploadJob, parts }).success).toBe(false);
  });
  it('a Timestamp with an offset or without a time', () => {
    expect(Timestamp.safeParse('2027-03-15T09:30:00+01:00').success).toBe(false);
    expect(Timestamp.safeParse('2027-03-15').success).toBe(false);
    expect(Timestamp.safeParse(NOW).success).toBe(true);
  });
});
