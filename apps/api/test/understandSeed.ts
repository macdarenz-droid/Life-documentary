// Seeding for the understanding tests: a person, a documentary and moments with their assets written
// straight into D1, and working copies put into R2 at their fixed keys.
import type { UploadPurpose, Uuid } from '@life/contracts';
import { database } from '../src/data/db';
import { mediaKey } from '../src/data/mediaKeys';
import { mediaAssets, moments } from '../src/data/schema';
import { bindings } from './session';

export const WEEK = '2027-03-15';
const T0 = '2027-03-15T08:00:00.000Z';

type Kind = 'videoAnswer' | 'voiceAnswer' | 'photo' | 'clip' | 'note';

export type Seeded = { momentId: Uuid; assetId?: Uuid; kind: Kind };

export async function seedDocumentary() {
  const userId = crypto.randomUUID() as Uuid;
  const documentaryId = crypto.randomUUID() as Uuid;
  await bindings.DB.prepare(
    "INSERT INTO user (id, name, email, email_verified) VALUES (?, '', ?, 1)",
  )
    .bind(userId, `${userId}@example.com`)
    .run();
  await bindings.DB.prepare(
    `INSERT INTO documentaries (id, owner_user_id, title, kind, time_zone, episode_day, episode_hour, created_at, updated_at)
     VALUES (?, ?, 'Mine', 'solo', 'Europe/Berlin', 0, 18, ?, ?)`,
  )
    .bind(documentaryId, userId, T0, T0)
    .run();
  const db = database(bindings.DB);

  const add = async (
    kind: Kind,
    options: { capturedAt?: string; localOnly?: boolean } = {},
  ): Promise<Seeded> => {
    const momentId = crypto.randomUUID() as Uuid;
    const assetKind =
      kind === 'videoAnswer' || kind === 'clip'
        ? 'video'
        : kind === 'voiceAnswer'
          ? 'audio'
          : kind === 'photo'
            ? 'photo'
            : null;
    const assetId = assetKind ? (crypto.randomUUID() as Uuid) : undefined;
    if (assetId && assetKind) {
      await db.insert(mediaAssets).values({
        id: assetId,
        documentaryId,
        ownerUserId: userId,
        kind: assetKind,
        durationMs: assetKind === 'photo' ? null : 9000,
        width: assetKind === 'audio' ? null : 1080,
        height: assetKind === 'audio' ? null : 1920,
        bytes: 1000,
        sha256: 'a'.repeat(64),
        cloudKey: null,
        createdAt: T0,
        updatedAt: T0,
        deletedAt: null,
      });
    }
    const momentKind = kind === 'videoAnswer' || kind === 'voiceAnswer' ? 'answer' : kind;
    await db.insert(moments).values({
      id: momentId,
      documentaryId,
      authorUserId: userId,
      capturedAt: options.capturedAt ?? '2027-03-17T10:00:00.000Z',
      timeZone: 'Europe/Berlin',
      kind: momentKind,
      questionId: momentKind === 'answer' ? crypto.randomUUID() : null,
      mediaAssetId: assetId ?? null,
      text: kind === 'note' ? 'Rain on the tram window.' : null,
      mood: null,
      placeName: null,
      localOnly: options.localOnly ?? false,
      storylineIds: [],
      castIds: [],
      updatedAt: T0,
      deletedAt: null,
    });
    return { momentId, ...(assetId ? { assetId } : {}), kind };
  };

  /** Puts the working copy of `seeded` for `purpose` into R2. */
  const upload = async (seeded: Seeded, purpose: UploadPurpose, bytes = 3000) => {
    const contentType =
      purpose === 'answer'
        ? seeded.kind === 'voiceAnswer'
          ? 'audio/mp4'
          : 'video/quicktime'
        : 'image/jpeg';
    await bindings.MEDIA.put(
      mediaKey(userId, documentaryId, seeded.assetId!, purpose),
      new Uint8Array(bytes).fill(7),
      { httpMetadata: { contentType } },
    );
  };

  /** The five kinds, each with every working copy it may send. */
  const fullWeek = async () => {
    const videoAnswer = await add('videoAnswer');
    const voiceAnswer = await add('voiceAnswer');
    const photo = await add('photo');
    const clip = await add('clip');
    const note = await add('note');
    await upload(videoAnswer, 'answer');
    await upload(videoAnswer, 'keyframe');
    await upload(voiceAnswer, 'answer');
    await upload(photo, 'preview');
    await upload(clip, 'keyframe');
    return { videoAnswer, voiceAnswer, photo, clip, note };
  };

  const workingCopies = async () =>
    (await bindings.MEDIA.list({ prefix: `tmp/${userId}/` })).objects.map((o) => o.key);

  const derivedRows = async () =>
    (
      await bindings.DB.prepare(
        'SELECT moment_id AS momentId, provider, transcript, caption FROM derived WHERE documentary_id = ? ORDER BY moment_id, provider',
      )
        .bind(documentaryId)
        .all<{
          momentId: string;
          provider: string;
          transcript: string | null;
          caption: string | null;
        }>()
    ).results;

  return { db, userId, documentaryId, add, upload, fullWeek, workingCopies, derivedRows };
}
