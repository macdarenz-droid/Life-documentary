// An in-memory copy of the server's POST /sync rule for sync tests: last-write-wins per row (ties keep
// the stored row), `leavesDevice` refusals, `not_yours` for a media asset of another user, a change log with a cursor, and pages of pulled changes.
import { SyncRequest, SyncResponse, type SyncChange, type SyncRefusal } from '@life/contracts';
import { leavesDevice } from '@life/story';
import type { Api } from '../../domain/capturePorts';

export type FakeSyncApi = Api & {
  /** Every request as the phone sent it, serialized, in order. */
  sent: string[];
  /** Rows the server holds, by `entity:id`. */
  rows: Map<string, SyncChange>;
  /** The next call throws, as a dropped connection would. */
  failNext: boolean;
  /** Writes a row as another phone would, with its own change-log entry. */
  seed(change: SyncChange): void;
};

const key = (c: SyncChange) => `${c.entity}:${c.row.id}`;

/** `userId` is the signed-in account; media assets owned by anyone else are refused `not_yours`. */
export function fakeSyncApi(options: { page?: number; userId?: string } = {}): FakeSyncApi {
  const page = options.page ?? 500;
  const rows = new Map<string, SyncChange>();
  const log: { seq: number; key: string }[] = [];
  const record = (change: SyncChange) => {
    rows.set(key(change), change);
    log.push({ seq: log.length + 1, key: key(change) });
  };
  const unused = async (): Promise<never> => {
    throw new Error('Not part of the sync fake');
  };

  const api: FakeSyncApi = {
    sent: [],
    rows,
    failNext: false,
    seed: record,
    me: unused,
    registerDevice: unused,
    linkDocumentary: unused,
    requestDeletion: unused,
    cancelDeletion: unused,
    createUpload: unused,
    uploadPart: unused,
    completeUpload: unused,
    sync: async (input) => {
      api.sent.push(JSON.stringify(input));
      if (api.failNext) {
        api.failNext = false;
        throw new Error('No network');
      }
      const request = SyncRequest.parse(input);
      const keptAssets = new Set(
        request.changes.flatMap((c) =>
          c.entity === 'moment' && !leavesDevice(c.row, { cloudBackup: false }).row
            ? [c.row.mediaAssetId]
            : [],
        ),
      );
      const refused: SyncRefusal[] = [];
      const written = new Set<string>();
      for (const change of request.changes) {
        const prior = rows.get(key(change));
        const refuse = (reason: SyncRefusal['reason']) =>
          refused.push({ entity: change.entity, id: change.row.id, reason });
        if (
          options.userId !== undefined &&
          change.entity === 'mediaAsset' &&
          change.row.ownerUserId !== options.userId
        ) {
          refuse('not_yours');
          continue;
        }
        if (
          (change.entity === 'moment' && !leavesDevice(change.row, { cloudBackup: false }).row) ||
          (change.entity === 'mediaAsset' && keptAssets.has(change.row.id))
        ) {
          refuse('local_only');
          continue;
        }
        const stale =
          prior !== undefined &&
          ('updatedAt' in change.row && 'updatedAt' in prior.row
            ? Date.parse(prior.row.updatedAt) >= Date.parse(change.row.updatedAt)
            : JSON.stringify(prior.row) === JSON.stringify(change.row));
        if (stale) {
          refuse('stale');
          continue;
        }
        record(change);
        written.add(key(change));
      }
      const after = log.filter((e) => e.seq > (request.cursor ?? 0) && !written.has(e.key));
      const top = log.at(-1)?.seq ?? 0;
      const slice = after.slice(0, page);
      const cursor = after.length > page ? slice.at(-1)!.seq : Math.max(request.cursor ?? 0, top);
      return SyncResponse.parse({
        cursor,
        changes: slice.map((e) => rows.get(e.key)!),
        refused,
      });
    },
  };
  return api;
}
