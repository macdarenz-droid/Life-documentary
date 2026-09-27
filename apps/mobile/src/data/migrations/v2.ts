import type { Migration } from './types';

// Schema v2: device settings as key/value rows (the daily reminder, one-time offers). Never edit this
// text once shipped (CLAUDE.md rule 6). Device-only: nothing here is synced, so D1 has no counterpart.
export const v2: Migration = {
  version: 2,
  name: 'settings',
  sql: `
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`,
};
