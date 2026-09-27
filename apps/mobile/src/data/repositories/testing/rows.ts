// Valid rows for repository tests, all linked to one documentary, on a fresh v1 memory database.
import {
  CastMember,
  Documentary,
  Episode,
  MediaAsset,
  Moment,
  Question,
  Storyline,
  UploadJob,
  Uuid,
} from '@life/contracts';
import { migrate, migrations } from '../../migrations';
import { put as putDocumentary } from '../documentaries';
import type { SqlDriver } from '../../sqlite/driver';
import { openMemoryDriver } from '../../sqlite/testing/memoryDriver';

export const NOW = '2027-03-15T09:30:00Z';
export const id = (n: number): Uuid =>
  Uuid.parse(`00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`);

export const documentary = Documentary.parse({
  id: id(1),
  ownerUserId: id(2),
  title: 'My year',
  kind: 'solo',
  timeZone: 'Europe/Berlin',
  createdAt: NOW,
  updatedAt: NOW,
});

export const asset = (n: number): MediaAsset =>
  MediaAsset.parse({
    id: id(n),
    ownerUserId: id(2),
    kind: 'video',
    durationMs: 9000,
    width: 1080,
    height: 1920,
    bytes: 4_200_000,
    sha256: 'a'.repeat(64),
    localPath: `media/${n}.enc`,
    wrappedKey: 'a2V5',
    uploadState: 'queued',
    createdAt: NOW,
  });

export const storyline = (n: number, patch: Partial<Storyline> = {}): Storyline =>
  Storyline.parse({
    id: id(n),
    documentaryId: id(1),
    title: `Story ${n}`,
    openedAt: NOW,
    updatedAt: NOW,
    ...patch,
  });

export const cast = (n: number, name: string): CastMember =>
  CastMember.parse({ id: id(n), documentaryId: id(1), name, createdAt: NOW, updatedAt: NOW });

export const question = (n: number, askedOn: string, patch: Partial<Question> = {}): Question =>
  Question.parse({
    id: id(n),
    documentaryId: id(1),
    templateId: 'q080',
    reason: 'general',
    askedOn,
    text: 'What stayed with you from today?',
    ...patch,
  });

export const note = (n: number, capturedAt: string, patch: Partial<Moment> = {}): Moment =>
  Moment.parse({
    id: id(n),
    documentaryId: id(1),
    authorUserId: id(2),
    capturedAt,
    timeZone: 'Europe/Berlin',
    kind: 'note',
    text: 'A slow morning.',
    localOnly: false,
    storylineIds: [],
    castIds: [],
    updatedAt: capturedAt,
    ...patch,
  });

export const episode = (n: number, number: number): Episode =>
  Episode.parse({
    id: id(n),
    documentaryId: id(1),
    number,
    weekStart: '2027-03-08',
    weekEnd: '2027-03-14',
    state: 'ready',
    planVersion: 1,
    renderVersion: 1,
    costCents: 42,
    updatedAt: NOW,
  });

export const uploadJob = (assetId: Uuid, patch: Partial<UploadJob> = {}): UploadJob =>
  UploadJob.parse({
    assetId,
    purpose: 'answer',
    state: 'pending',
    parts: [],
    bytesDone: 0,
    attempts: 0,
    updatedAt: NOW,
    ...patch,
  });

/** A fresh v1 database with the documentary row in place. */
export async function freshDb(): Promise<SqlDriver> {
  const db = await openMemoryDriver();
  await migrate(db, NOW, migrations);
  await putDocumentary(db, documentary);
  return db;
}
