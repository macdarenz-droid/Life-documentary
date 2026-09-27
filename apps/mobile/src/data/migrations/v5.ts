import type { Migration } from './types';

// Schema v5 (P12): the text the service derived from a moment (a transcript or a caption), one row per
// moment and provider, pulled down only. Rows pulled before this version were skipped while the cursor
// moved past them, so the cursor is cleared and the next round pulls everything again. Rows with a time
// land last-write-wins and derived rows by the newest `producedAt`. Questions are not last-write-wins: a
// pulled question lands as sent but keeps the local answer when it has none or names a moment deleted on
// this phone. Never edit the SQL once shipped (rule 6).
export const v5: Migration = {
  version: 5,
  name: 'derived text',
  sql: `
CREATE TABLE derived (
  id TEXT PRIMARY KEY NOT NULL,
  moment_id TEXT NOT NULL REFERENCES moments (id),
  transcript TEXT,
  caption TEXT,
  language TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_version TEXT NOT NULL,
  produced_at TEXT NOT NULL,
  UNIQUE (moment_id, provider)
);

DELETE FROM settings WHERE key = 'sync.cursor';
`,
};
