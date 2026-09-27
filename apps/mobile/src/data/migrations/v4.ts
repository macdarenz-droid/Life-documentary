import type { Migration } from './types';

// Schema v4 (P6): an upload job is keyed by its asset and purpose, and may carry the encrypted working
// copy it sends (a photo's preview). SQLite cannot change a primary key in place, so both tables are
// rebuilt: answers' jobs and their parts are kept with purpose 'answer', every other job is dropped
// (their assets are enqueued again by the P6 rule). `purpose` has no CHECK list: the UploadJob
// contract guards it, so later purposes need no rebuild. Never edit this text once shipped (rule 6).
export const v4: Migration = {
  version: 4,
  name: 'upload jobs by purpose',
  sql: `
CREATE TABLE upload_jobs_v4 (
  asset_id TEXT NOT NULL REFERENCES media_assets (id),
  purpose TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'uploading', 'completing', 'done', 'failed')),
  upload_id TEXT,
  bytes_done INTEGER NOT NULL CHECK (bytes_done >= 0),
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  next_attempt_at TEXT,
  source_path TEXT,
  source_wrapped_key TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, purpose)
);

INSERT INTO upload_jobs_v4
  (asset_id, purpose, state, upload_id, bytes_done, attempts, next_attempt_at, updated_at)
SELECT asset_id, 'answer', state, upload_id, bytes_done, attempts, next_attempt_at, updated_at
FROM upload_jobs
WHERE asset_id IN (SELECT media_asset_id FROM moments WHERE kind = 'answer');

CREATE TABLE upload_job_parts_v4 (
  asset_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  part_number INTEGER NOT NULL CHECK (part_number >= 1),
  etag TEXT NOT NULL,
  PRIMARY KEY (asset_id, purpose, part_number),
  FOREIGN KEY (asset_id, purpose) REFERENCES upload_jobs_v4 (asset_id, purpose) ON DELETE CASCADE
);

INSERT INTO upload_job_parts_v4 (asset_id, purpose, part_number, etag)
SELECT asset_id, 'answer', part_number, etag
FROM upload_job_parts
WHERE asset_id IN (SELECT asset_id FROM upload_jobs_v4);

DROP TABLE upload_job_parts;
DROP TABLE upload_jobs;
ALTER TABLE upload_jobs_v4 RENAME TO upload_jobs;
ALTER TABLE upload_job_parts_v4 RENAME TO upload_job_parts;
CREATE INDEX upload_jobs_state_next ON upload_jobs (state, next_attempt_at);
`,
};
