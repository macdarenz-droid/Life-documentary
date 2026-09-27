// POST /sync (P6, D37): a phone sends the rows it changed for a documentary it owns and gets back what
// changed since its cursor. Each row is refused when it belongs elsewhere (`not_yours`), may not leave
// the phone (`local_only`), or is not newer than the stored one (`stale`); the rest are written with
// one change-log row each in a single batch. Rows this request wrote are not sent back to it. A pull
// also carries the text the server derived (P12); an accepted moment tombstone removes that moment's
// derived rows in the same batch.
import {
  SyncRequest,
  SyncResponse,
  type PulledChange,
  type PulledEntity,
  type SyncChange,
  type SyncEntity,
  type SyncRefusal,
} from '@life/contracts';
import type { BatchItem } from 'drizzle-orm/batch';
import { Hono } from 'hono';
import { database } from '../data/db';
import * as changes from '../data/repositories/changes';
import * as derivedRepo from '../data/repositories/derived';
import * as documentariesRepo from '../data/repositories/documentaries';
import * as rows from '../data/repositories/sync';
import { momentRowMayLeave } from '../policy/leavesDevice';
import { apiError } from '../shared/errors';
import { parseBody } from './body';
import { requireSession, type AppEnv } from './middleware/session';

/** At most this many rows come back per response; the phone asks again from the new cursor. */
export const SYNC_PAGE = 500;

const key = (entity: PulledEntity, id: string) => `${entity}:${id}`;

/** JSON with sorted keys and no undefined values, to compare two rows. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/**
 * The row as it would be stored. A media asset's cloud key is the server's alone: only a completed
 * upload sets it, so whatever the phone sends is dropped and the stored key kept.
 */
function merged(change: SyncChange, prior: PulledChange | undefined): SyncChange {
  if (change.entity !== 'mediaAsset') return change;
  const row = { ...change.row };
  delete row.cloudKey;
  const cloudKey = prior?.entity === 'mediaAsset' ? prior.row.cloudKey : undefined;
  return { entity: 'mediaAsset', row: { ...row, ...(cloudKey ? { cloudKey } : {}) } };
}

/**
 * Same or older than the stored row. Media assets have no `updatedAt`, so they are stale only when
 * nothing changed. A stored question is replaced only by an answer when it has none, or when its
 * answer's moment is deleted on the server, so a stored answer is never cleared.
 */
function isStale(
  change: SyncChange,
  prior: PulledChange | undefined,
  momentDeleted: (id: string) => boolean,
): boolean {
  if (!prior) return false;
  if (change.entity === 'mediaAsset') {
    return canonical(merged(change, prior).row) === canonical(prior.row);
  }
  if (change.entity === 'question' && prior.entity === 'question') {
    const incoming = change.row.answeredByMomentId;
    const answer = prior.row.answeredByMomentId;
    if (!incoming || incoming === answer) return true;
    return answer !== undefined && !momentDeleted(answer);
  }
  const stored = prior.row as { updatedAt: string };
  return (
    Date.parse(stored.updatedAt) >= Date.parse((change.row as { updatedAt: string }).updatedAt)
  );
}

export const sync = new Hono<AppEnv>().post('/sync', requireSession, async (c) => {
  const body = await parseBody(c, SyncRequest);
  if (!body) return apiError(c, 400, 'bad_request', 'The changes could not be read.');
  const db = database(c.env.DB);
  const userId = c.var.user.id;
  const documentary = await documentariesRepo.get(db, body.documentaryId);
  if (!documentary || documentary.ownerUserId !== userId) {
    return apiError(c, 403, 'forbidden', 'This documentary belongs to another account.');
  }

  const ids = new Map<SyncEntity, string[]>();
  for (const change of body.changes) {
    ids.set(change.entity, [...(ids.get(change.entity) ?? []), change.row.id]);
  }
  const stored = new Map<
    SyncEntity,
    Map<string, { documentaryId: string; change: PulledChange }>
  >();
  for (const [entity, list] of ids) stored.set(entity, await rows.getMany(db, entity, list));

  // The moments that answer stored questions, to tell whether an answer's moment is deleted.
  const storedMoments =
    stored.get('moment') ?? new Map<string, { documentaryId: string; change: PulledChange }>();
  stored.set('moment', storedMoments);
  const answerIds = [...(stored.get('question')?.values() ?? [])].flatMap((q) =>
    q.change.entity === 'question' && q.change.row.answeredByMomentId
      ? [q.change.row.answeredByMomentId]
      : [],
  );
  const missing = answerIds.filter((id) => !storedMoments.has(id));
  if (missing.length > 0) {
    for (const [id, row] of await rows.getMany(db, 'moment', missing)) storedMoments.set(id, row);
  }
  const momentDeleted = (id: string) => {
    const moment = storedMoments.get(id)?.change;
    return moment?.entity === 'moment' && moment.row.deletedAt !== undefined;
  };

  // Media of a moment kept on the phone never leaves it either.
  const localOnlyAssets = new Set(
    body.changes.flatMap((ch) =>
      ch.entity === 'moment' && !momentRowMayLeave(ch.row) && ch.row.mediaAssetId
        ? [ch.row.mediaAssetId]
        : [],
    ),
  );

  const now = new Date().toISOString();
  const refused: SyncRefusal[] = [];
  const statements: BatchItem<'sqlite'>[] = [];
  const written = new Set<string>();
  for (const change of body.changes) {
    const { entity } = change;
    const id = change.row.id;
    const known = stored.get(entity)!;
    const prior = known.get(id);
    const refuse = (reason: SyncRefusal['reason']) => refused.push({ entity, id, reason });

    const elsewhere =
      (prior !== undefined && prior.documentaryId !== body.documentaryId) ||
      (change.entity === 'documentary' && change.row.id !== body.documentaryId) ||
      (change.entity === 'mediaAsset' && change.row.ownerUserId !== userId) ||
      ('documentaryId' in change.row && change.row.documentaryId !== body.documentaryId);
    if (elsewhere) {
      refuse('not_yours');
      continue;
    }
    if (
      (change.entity === 'moment' && !momentRowMayLeave(change.row)) ||
      (change.entity === 'mediaAsset' && localOnlyAssets.has(id))
    ) {
      refuse('local_only');
      continue;
    }
    if (isStale(change, prior?.change, momentDeleted)) {
      refuse('stale');
      continue;
    }
    statements.push(rows.upsert(db, body.documentaryId, change, now));
    if (change.entity === 'moment' && change.row.deletedAt !== undefined) {
      statements.push(derivedRepo.deleteForMoment(db, change.row.id));
    }
    statements.push(
      changes.record(db, body.documentaryId, entity, id, rows.changeTime(change, now)),
    );
    known.set(id, { documentaryId: body.documentaryId, change: merged(change, prior?.change) });
    written.add(key(entity, id));
  }
  if (statements.length > 0) {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  }

  const pulled = await changes.since(
    db,
    body.documentaryId,
    body.cursor,
    SYNC_PAGE + written.size + 1,
  );
  const others = pulled.rows.filter((r) => !written.has(key(r.entity, r.entityId)));
  const page = others.slice(0, SYNC_PAGE);
  const more = others.length > SYNC_PAGE;
  const cursor = more
    ? page.at(-1)!.seq
    : Math.max(body.cursor ?? 0, pulled.top ?? 0, page.at(-1)?.seq ?? 0);

  const found = new Map<string, PulledChange>();
  const wanted = new Map<PulledEntity, string[]>();
  for (const r of page) wanted.set(r.entity, [...(wanted.get(r.entity) ?? []), r.entityId]);
  for (const [entity, list] of wanted) {
    for (const [id, row] of await rows.getMany(db, entity, list))
      found.set(key(entity, id), row.change);
  }
  const out = page.flatMap((r) => {
    const change = found.get(key(r.entity, r.entityId));
    return change ? [change] : [];
  });

  return c.json(SyncResponse.parse({ cursor, changes: out, refused }), 200);
});
