// GET /episodes/:id/video (P16, D42): the owner's ready episode as MP4, streamed from R2 through the
// Worker, so no R2 credentials reach the phone. A single `bytes=` range is honoured (iOS playback needs
// it); any other Range header is ignored and the whole file is sent. Nothing is cached on the way.
import { Uuid } from '@life/contracts';
import { Hono } from 'hono';
import { database } from '../data/db';
import * as documentariesRepo from '../data/repositories/documentaries';
import * as episodesRepo from '../data/repositories/episodes';
import { apiError } from '../shared/errors';
import { requireSession, type AppEnv } from './middleware/session';

const BASE_HEADERS = {
  'Accept-Ranges': 'bytes',
  'Content-Type': 'video/mp4',
  'Cache-Control': 'private, no-store',
};

export type ByteRange = { offset: number; length: number };

/**
 * Reads a `Range` header against a file of `size` bytes: `undefined` for the whole file (no header, or
 * one that is not a single byte range), `'unsatisfiable'` when the range starts past the end.
 */
export function readRange(
  header: string | undefined,
  size: number,
): ByteRange | 'unsatisfiable' | undefined {
  if (header === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') return undefined;
  if (first === '') {
    // A suffix: the last `last` bytes.
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(first);
  if (last !== '' && Number(last) < start) return undefined;
  if (start >= size) return 'unsatisfiable';
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  return { offset: start, length: end - start + 1 };
}

export const episodes = new Hono<AppEnv>().get('/episodes/:id/video', requireSession, async (c) => {
  const notFound = () => apiError(c, 404, 'not_found', 'There is no episode to play here.');
  const id = Uuid.safeParse(c.req.param('id'));
  if (!id.success) return notFound();
  const db = database(c.env.DB);
  const episode = await episodesRepo.get(db, id.data);
  if (!episode || episode.state !== 'ready' || episode.mp4Key === undefined) return notFound();
  const documentary = await documentariesRepo.get(db, episode.documentaryId);
  if (!documentary || documentary.ownerUserId !== c.var.user.id) return notFound();

  const head = await c.env.MEDIA.head(episode.mp4Key);
  if (!head) return notFound();
  const size = head.size;
  const range = readRange(c.req.header('Range'), size);
  if (range === 'unsatisfiable') {
    return c.body(null, 416, { ...BASE_HEADERS, 'Content-Range': `bytes */${size}` });
  }
  const object = await c.env.MEDIA.get(episode.mp4Key, range ? { range } : undefined);
  if (!object) return notFound();
  if (!range) {
    return c.body(object.body, 200, { ...BASE_HEADERS, 'Content-Length': String(size) });
  }
  return c.body(object.body, 206, {
    ...BASE_HEADERS,
    'Content-Length': String(range.length),
    'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`,
  });
});
