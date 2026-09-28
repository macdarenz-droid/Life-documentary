// The D1 tables, as Drizzle SQLite tables. The auth tables are the ones Better Auth needs for our options
// (checked against getAuthTables in test/auth.test.ts); ids are UUID text, times are integer milliseconds.
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).default(nowMs).notNull();
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .default(nowMs)
    .$onUpdate(() => new Date())
    .notNull();

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull(),
});

/** The tables Better Auth reads and writes, keyed by its model names. */
export const authSchema = { user, session, account, verification, rateLimit };

// Product tables (P4). Times are ISO-8601 text, as in the contracts; rows are parsed by the repositories.

export const documentaries = sqliteTable(
  'documentaries',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind', { enum: ['solo', 'shared'] }).notNull(),
    timeZone: text('time_zone').notNull(),
    episodeDay: integer('episode_day').notNull(),
    episodeHour: integer('episode_hour').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('documentaries_owner_idx').on(t.ownerUserId)],
);

export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: ['ios', 'android'] }).notNull(),
    appVersion: text('app_version').notNull(),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    /** The Expo push token (P16); a token lives on one device row only. */
    pushToken: text('push_token'),
  },
  (t) => [index('devices_user_idx').on(t.userId)],
);

export const deletionRequests = sqliteTable('deletion_requests', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  requestedAt: text('requested_at').notNull(),
  purgeAfter: text('purge_after').notNull(),
  cancelledAt: text('cancelled_at'),
});

// Synced rows (P6, D37): keyed by the phone's UUIDs, last-write-wins per row on `updated_at`. Media
// assets and questions have no `updatedAt` in their contracts, so theirs is the server's write time.
// Device-only fields (local paths, keys, posters, upload state) have no column.

const documentaryId = () =>
  text('documentary_id')
    .notNull()
    .references(() => documentaries.id, { onDelete: 'cascade' });

export const moments = sqliteTable(
  'moments',
  {
    id: text('id').primaryKey(),
    documentaryId: documentaryId(),
    authorUserId: text('author_user_id').notNull(),
    capturedAt: text('captured_at').notNull(),
    timeZone: text('time_zone').notNull(),
    kind: text('kind', { enum: ['answer', 'clip', 'photo', 'note'] }).notNull(),
    questionId: text('question_id'),
    mediaAssetId: text('media_asset_id'),
    text: text('text'),
    mood: text('mood', { enum: ['bright', 'calm', 'tender', 'tired', 'heavy'] }),
    placeName: text('place_name'),
    localOnly: integer('local_only', { mode: 'boolean' }).notNull(),
    storylineIds: text('storyline_ids', { mode: 'json' }).$type<string[]>().notNull(),
    castIds: text('cast_ids', { mode: 'json' }).$type<string[]>().notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('moments_documentary_idx').on(t.documentaryId)],
);

export const mediaAssets = sqliteTable(
  'media_assets',
  {
    id: text('id').primaryKey(),
    documentaryId: documentaryId(),
    ownerUserId: text('owner_user_id').notNull(),
    kind: text('kind', { enum: ['video', 'photo', 'audio'] }).notNull(),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),
    cloudKey: text('cloud_key'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('media_assets_documentary_idx').on(t.documentaryId)],
);

export const questions = sqliteTable(
  'questions',
  {
    id: text('id').primaryKey(),
    documentaryId: documentaryId(),
    templateId: text('template_id').notNull(),
    reason: text('reason').notNull(),
    askedOn: text('asked_on').notNull(),
    storylineId: text('storyline_id'),
    text: text('text').notNull(),
    answeredByMomentId: text('answered_by_moment_id'),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('questions_documentary_idx').on(t.documentaryId)],
);

export const storylines = sqliteTable(
  'storylines',
  {
    id: text('id').primaryKey(),
    documentaryId: documentaryId(),
    title: text('title').notNull(),
    openedAt: text('opened_at').notNull(),
    closedAt: text('closed_at'),
    summary: text('summary'),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('storylines_documentary_idx').on(t.documentaryId)],
);

export const castMembers = sqliteTable(
  'cast_members',
  {
    id: text('id').primaryKey(),
    documentaryId: documentaryId(),
    name: text('name').notNull(),
    relation: text('relation'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('cast_members_documentary_idx').on(t.documentaryId)],
);

/** One row per accepted change; a phone pulls what changed after its cursor (`seq`). */
export const changeLog = sqliteTable(
  'change_log',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    documentaryId: documentaryId(),
    entity: text('entity', {
      enum: [
        'documentary',
        'moment',
        'mediaAsset',
        'question',
        'storyline',
        'castMember',
        'derived',
        'originalRequest',
      ],
    }).notNull(),
    entityId: text('entity_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('change_log_documentary_seq_idx').on(t.documentaryId, t.seq)],
);

// Open multipart uploads into R2 (P6, D34): one per asset and purpose; the row goes when the upload is
// completed or aborted.
export const uploads = sqliteTable(
  'uploads',
  {
    assetId: text('asset_id').notNull(),
    purpose: text('purpose', { enum: ['answer', 'preview', 'keyframe', 'original'] }).notNull(),
    documentaryId: documentaryId(),
    uploadId: text('upload_id').notNull(),
    key: text('key').notNull(),
    bytes: integer('bytes').notNull(),
    partCount: integer('part_count').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.purpose] })],
);

// Understanding (P12, D38): one episode per documentary and week, the text derived from each moment
// (one row per moment and provider) and what each step cost. `step`, `provider` and `unit` are plain
// text without CHECK lists, so later steps add values without a table rebuild; the contracts guard them.

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    documentaryId: documentaryId(),
    number: integer('number').notNull(),
    weekStart: text('week_start').notNull(),
    weekEnd: text('week_end').notNull(),
    state: text('state').notNull(),
    planVersion: integer('plan_version').notNull(),
    renderVersion: integer('render_version').notNull(),
    mp4Key: text('mp4_key'),
    posterKey: text('poster_key'),
    durationMs: integer('duration_ms'),
    costCents: integer('cost_cents').notNull(),
    summary: text('summary'),
    deliveredAt: text('delivered_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('episodes_documentary_week_idx').on(t.documentaryId, t.weekStart)],
);

export const derived = sqliteTable(
  'derived',
  {
    id: text('id').primaryKey(),
    documentaryId: documentaryId(),
    momentId: text('moment_id')
      .notNull()
      .references(() => moments.id, { onDelete: 'cascade' }),
    transcript: text('transcript'),
    /** TranscriptSegment[] as JSON (P12 fix r1, D40). */
    segments: text('segments'),
    caption: text('caption'),
    language: text('language').notNull(),
    provider: text('provider').notNull(),
    modelVersion: text('model_version').notNull(),
    producedAt: text('produced_at').notNull(),
  },
  (t) => [uniqueIndex('derived_moment_provider_idx').on(t.momentId, t.provider)],
);

export const costLedger = sqliteTable(
  'cost_ledger',
  {
    id: text('id').primaryKey(),
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    provider: text('provider').notNull(),
    unit: text('unit').notNull(),
    units: integer('units').notNull(),
    microUsd: integer('micro_usd').notNull(),
    at: text('at').notNull(),
  },
  (t) => [uniqueIndex('cost_ledger_episode_step_unit_idx').on(t.episodeId, t.step, t.unit)],
);

/** One stored version of an episode's plan (P13, D39): the plan as JSON, made by the model or the recap. */
export const episodePlans = sqliteTable(
  'episode_plans',
  {
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    plan: text('plan').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('episode_plans_episode_version_idx').on(t.episodeId, t.version)],
);

/**
 * One synthesised narrator line of an episode's plan version (P14, D40): the MP3 in R2 under `key`, cached
 * by `hash`, with its length and word timings (`words` as JSON). `kept` is false when the cap left it out.
 */
export const narrationClips = sqliteTable(
  'narration_clips',
  {
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    planVersion: integer('plan_version').notNull(),
    index: integer('index').notNull(),
    kind: text('kind').notNull(),
    sceneIndex: integer('scene_index'),
    text: text('text').notNull(),
    voiceId: text('voice_id').notNull(),
    key: text('key').notNull(),
    hash: text('hash').notNull(),
    durationMs: integer('duration_ms').notNull(),
    words: text('words').notNull(),
    kept: integer('kept', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('narration_clips_episode_version_index_idx').on(
      t.episodeId,
      t.planVersion,
      t.index,
    ),
    index('narration_clips_episode_hash_idx').on(t.episodeId, t.hash),
  ],
);

/** One render of an episode (P15, D41): a plan version in one shape, its file, its state and its cost. */
export const renders = sqliteTable(
  'renders',
  {
    id: text('id').primaryKey(),
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    planVersion: integer('plan_version').notNull(),
    renderVersion: integer('render_version').notNull(),
    format: text('format').notNull(),
    vendorRenderId: text('vendor_render_id'),
    bucket: text('bucket'),
    outKey: text('out_key').notNull(),
    durationMs: integer('duration_ms').notNull(),
    state: text('state').notNull(),
    reason: text('reason'),
    costMicroUsd: integer('cost_micro_usd'),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (t) => [
    uniqueIndex('renders_episode_version_format_idx').on(t.episodeId, t.renderVersion, t.format),
  ],
);

// Requests for the full photos and clips an episode's plan uses (P16, D42). One row per episode and
// asset; phones pull them. They go with their episode.
export const originalRequests = sqliteTable(
  'original_requests',
  {
    id: text('id').primaryKey(),
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    documentaryId: text('documentary_id').notNull(),
    momentId: text('moment_id').notNull(),
    assetId: text('asset_id').notNull(),
    state: text('state', { enum: ['open', 'met', 'closed'] }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('original_requests_episode_asset_idx').on(t.episodeId, t.assetId),
    index('original_requests_asset_idx').on(t.assetId),
  ],
);
