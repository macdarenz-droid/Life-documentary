import { Uuid } from '@life/contracts';
import { decryptFile } from '../data/fileStore/fileStore';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as questions from '../data/repositories/questions';
import * as uploadJobs from '../data/repositories/uploadJobs';
import { openLocalDocumentary } from './bootstrap';
import { captureMoment, type MediaInput } from './captureMoment';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';
import { todayQuestion } from './todayQuestion';

const SOURCE = 'tmp/recording.mp4';
const bytes = new Uint8Array(3000).map((_, i) => (i * 13) & 255);
const video: MediaInput = {
  sourcePath: SOURCE,
  mediaKind: 'video',
  durationMs: 9000,
  width: 1080,
  height: 1920,
};

async function setup() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-15T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  store.io.files.set(SOURCE, bytes);
  return { store, clock, ids, documentary };
}

const count = async (store: Awaited<ReturnType<typeof setup>>['store'], table: string) =>
  (await store.driver.first<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))?.n;

describe('captureMoment', () => {
  it('saves an answer: encrypted file, asset, moment, answered question and a pending upload', async () => {
    const { store, clock, ids, documentary } = await setup();
    const question = await todayQuestion(store, documentary, clock, ids);
    const moment = await captureMoment(store, clock, ids, {
      kind: 'answer',
      questionId: question.id,
      media: video,
      mood: 'calm',
      localOnly: false,
    });

    expect(moment).toMatchObject({ kind: 'answer', questionId: question.id, mood: 'calm' });
    expect(await moments.get(store.driver, moment.id)).toEqual(moment);
    const asset = await mediaAssets.get(store.driver, moment.mediaAssetId ?? '');
    expect(asset).toMatchObject({
      kind: 'video',
      uploadState: 'local',
      bytes: 3000,
      durationMs: 9000,
    });
    expect((await questions.get(store.driver, question.id))?.answeredByMomentId).toBe(moment.id);
    expect(await uploadJobs.get(store.driver, asset?.id ?? '')).toMatchObject({
      state: 'pending',
      attempts: 0,
    });

    await decryptFile({
      io: store.io,
      cipher: store.cipher,
      masterKey: store.masterKey,
      sourcePath: asset?.localPath ?? '',
      destPath: 'out/plain',
      assetId: asset?.id ?? '',
      wrappedKey: asset?.wrappedKey ?? '',
    });
    expect(Buffer.from(store.io.files.get('out/plain') ?? []).equals(Buffer.from(bytes))).toBe(
      true,
    );
    expect(store.io.files.has(SOURCE)).toBe(false);
  });

  it('writes no upload job for a local-only clip', async () => {
    const { store, clock, ids } = await setup();
    await captureMoment(store, clock, ids, { kind: 'clip', media: video, localOnly: true });
    expect(await count(store, 'media_assets')).toBe(1);
    expect(await count(store, 'upload_jobs')).toBe(0);
  });

  it('writes no file and no asset for a note', async () => {
    const { store, clock, ids } = await setup();
    const moment = await captureMoment(store, clock, ids, {
      kind: 'note',
      text: 'A slow morning.',
      localOnly: false,
    });
    expect(moment.mediaAssetId).toBeUndefined();
    expect(await count(store, 'media_assets')).toBe(0);
    expect(await count(store, 'upload_jobs')).toBe(0);
    expect([...store.io.files.keys()].filter((p) => p.startsWith('store/'))).toEqual([]);
  });

  it('leaves no row and no encrypted file when the transaction fails, and keeps the source', async () => {
    const { store, clock, ids } = await setup();
    const unknownStoryline = Uuid.parse('00000000-0000-4000-8000-0000000fffff');
    await expect(
      captureMoment(store, clock, ids, {
        kind: 'clip',
        media: video,
        storylineIds: [unknownStoryline],
        localOnly: false,
      }),
    ).rejects.toThrow();
    for (const table of ['media_assets', 'moments', 'moment_storylines', 'upload_jobs']) {
      expect(await count(store, table)).toBe(0);
    }
    expect([...store.io.files.keys()].filter((p) => p.startsWith('store/'))).toEqual([]);
    expect(store.io.files.has(SOURCE)).toBe(true);
  });
});
