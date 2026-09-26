import type { Migration } from './types';

// Schema v1, matching the T-004a contracts. Never edit this text once shipped: its checksum is stored
// on every device (CLAUDE.md rule 6). Enum lists are written out, not read from the contracts, for that
// reason.
export const v1: Migration = {
  version: 1,
  name: 'initial',
  sql: `
CREATE TABLE documentaries (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('solo', 'shared')),
  time_zone TEXT NOT NULL,
  episode_day INTEGER NOT NULL DEFAULT 0 CHECK (episode_day BETWEEN 0 AND 6),
  episode_hour INTEGER NOT NULL DEFAULT 18 CHECK (episode_hour BETWEEN 0 AND 23),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'photo', 'audio')),
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  local_path TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  cloud_key TEXT,
  upload_state TEXT NOT NULL CHECK (upload_state IN ('local', 'queued', 'uploading', 'uploaded')),
  created_at TEXT NOT NULL
);

CREATE TABLE storylines (
  id TEXT PRIMARY KEY NOT NULL,
  documentary_id TEXT NOT NULL REFERENCES documentaries (id),
  title TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  summary TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE cast_members (
  id TEXT PRIMARY KEY NOT NULL,
  documentary_id TEXT NOT NULL REFERENCES documentaries (id),
  name TEXT NOT NULL,
  relation TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY NOT NULL,
  documentary_id TEXT NOT NULL REFERENCES documentaries (id),
  template_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('after_quiet_days', 'anniversary', 'open_storyline', 'person_seen',
    'place_first_time', 'weekday', 'weekend', 'season', 'general')),
  asked_on TEXT NOT NULL,
  storyline_id TEXT REFERENCES storylines (id),
  text TEXT NOT NULL,
  answered_by_moment_id TEXT REFERENCES moments (id)
);

CREATE TABLE moments (
  id TEXT PRIMARY KEY NOT NULL,
  documentary_id TEXT NOT NULL REFERENCES documentaries (id),
  author_user_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  local_day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('answer', 'clip', 'photo', 'note')),
  question_id TEXT REFERENCES questions (id),
  media_asset_id TEXT REFERENCES media_assets (id),
  text TEXT,
  mood TEXT CHECK (mood IN ('bright', 'calm', 'tender', 'tired', 'heavy')),
  place_name TEXT,
  local_only INTEGER NOT NULL CHECK (local_only IN (0, 1)),
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE moment_storylines (
  moment_id TEXT NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  storyline_id TEXT NOT NULL REFERENCES storylines (id) ON DELETE CASCADE,
  PRIMARY KEY (moment_id, storyline_id)
);

CREATE TABLE moment_cast (
  moment_id TEXT NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  cast_id TEXT NOT NULL REFERENCES cast_members (id) ON DELETE CASCADE,
  PRIMARY KEY (moment_id, cast_id)
);

CREATE TABLE episodes (
  id TEXT PRIMARY KEY NOT NULL,
  documentary_id TEXT NOT NULL REFERENCES documentaries (id),
  number INTEGER NOT NULL CHECK (number >= 1),
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('scheduled', 'understanding', 'planning', 'narrating', 'rendering',
    'ready', 'failed', 'recap')),
  plan_version INTEGER NOT NULL CHECK (plan_version >= 0),
  render_version INTEGER NOT NULL CHECK (render_version >= 0),
  mp4_key TEXT,
  poster_key TEXT,
  duration_ms INTEGER,
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
  summary TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE upload_jobs (
  asset_id TEXT PRIMARY KEY NOT NULL REFERENCES media_assets (id),
  state TEXT NOT NULL CHECK (state IN ('pending', 'uploading', 'completing', 'done', 'failed')),
  upload_id TEXT,
  bytes_done INTEGER NOT NULL CHECK (bytes_done >= 0),
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  next_attempt_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE upload_job_parts (
  asset_id TEXT NOT NULL REFERENCES upload_jobs (asset_id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL CHECK (part_number >= 1),
  etag TEXT NOT NULL,
  PRIMARY KEY (asset_id, part_number)
);

CREATE INDEX moments_documentary_day ON moments (documentary_id, local_day);
CREATE UNIQUE INDEX questions_documentary_day ON questions (documentary_id, asked_on);
CREATE INDEX upload_jobs_state_next ON upload_jobs (state, next_attempt_at);
`,
};
