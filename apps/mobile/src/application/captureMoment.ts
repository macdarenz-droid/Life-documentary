// One capture, one step: the media is encrypted into the file store, then the asset, the moment, the
// answered question and (when `leavesDevice` lets an answer go up) its upload job are written in one
// transaction. A photo's preview job needs a file made first, so `enqueueUploads` adds it after.
import { MediaAsset, Moment } from '@life/contracts';
import type { MomentMood, Uuid } from '@life/contracts';
import { encryptFile } from '../data/fileStore/fileStore';
import * as documentaries from '../data/repositories/documentaries';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as questions from '../data/repositories/questions';
import { enqueueAnswer } from './enqueueUploads';
import type { Clock, Ids, Store } from './ports';

export type MediaInput = {
  sourcePath: string;
  mediaKind: 'video' | 'photo' | 'audio';
  durationMs?: number;
  width?: number;
  height?: number;
};

type Common = {
  mood?: MomentMood;
  placeName?: string;
  storylineIds?: Uuid[];
  castIds?: Uuid[];
  localOnly: boolean;
};

export type CaptureInput = Common &
  (
    | { kind: 'answer'; questionId: Uuid; media: MediaInput }
    | { kind: 'clip' | 'photo'; media: MediaInput }
    | { kind: 'note'; text: string }
  );

export async function captureMoment(
  store: Store,
  clock: Clock,
  ids: Ids,
  input: CaptureInput,
): Promise<Moment> {
  const { driver, io } = store;
  const [documentary] = await documentaries.listAll(driver);
  if (!documentary) throw new Error('No local documentary; call openLocalDocumentary first');
  const now = clock.now();
  const media = input.kind === 'note' ? undefined : input.media;

  let asset: MediaAsset | undefined;
  if (media) {
    const assetId = ids.newId();
    const destPath = `${store.storeDir}/${assetId}.lde`;
    let sealed: Awaited<ReturnType<typeof encryptFile>>;
    try {
      sealed = await encryptFile({
        io,
        cipher: store.cipher,
        masterKey: store.masterKey,
        sourcePath: media.sourcePath,
        destPath,
        assetId,
      });
    } catch (error) {
      if (await io.exists(destPath)) await io.remove(destPath);
      throw error;
    }
    asset = {
      id: assetId,
      ownerUserId: documentary.ownerUserId,
      kind: media.mediaKind,
      ...(media.durationMs !== undefined ? { durationMs: media.durationMs } : {}),
      ...(media.width !== undefined ? { width: media.width } : {}),
      ...(media.height !== undefined ? { height: media.height } : {}),
      bytes: sealed.bytes,
      sha256: sealed.sha256,
      localPath: destPath,
      wrappedKey: sealed.wrappedKey,
      uploadState: 'local',
      createdAt: now,
    };
  }

  const moment = {
    id: ids.newId(),
    documentaryId: documentary.id,
    authorUserId: documentary.ownerUserId,
    capturedAt: now,
    timeZone: documentary.timeZone,
    kind: input.kind,
    ...(input.kind === 'answer' ? { questionId: input.questionId } : {}),
    ...(asset ? { mediaAssetId: asset.id } : {}),
    ...(input.kind === 'note' ? { text: input.text } : {}),
    ...(input.mood !== undefined ? { mood: input.mood } : {}),
    ...(input.placeName !== undefined ? { placeName: input.placeName } : {}),
    localOnly: input.localOnly,
    storylineIds: input.storylineIds ?? [],
    castIds: input.castIds ?? [],
    updatedAt: now,
  } as Moment;

  let saved: Moment;
  try {
    saved = await driver.transaction(async (tx) => {
      const stored = asset ? await mediaAssets.put(tx, MediaAsset.parse(asset)) : undefined;
      const written = await moments.put(tx, Moment.parse(moment));
      if (input.kind === 'answer') await questions.markAnswered(tx, input.questionId, written.id);
      if (stored) await enqueueAnswer(tx, written, stored, now);
      return written;
    });
  } catch (error) {
    if (asset && (await io.exists(asset.localPath))) await io.remove(asset.localPath);
    throw error;
  }

  if (media && (await io.exists(media.sourcePath))) await io.remove(media.sourcePath);
  return saved;
}
