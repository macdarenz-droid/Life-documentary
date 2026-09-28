import type { Migration } from './types';

// Schema v6 (P16, D42): the service's requests for the full photos and clips an episode uses, pulled
// down only. There is no foreign key to `episodes`: the phone may not hold the episode yet. Rows pulled
// before this version were skipped while the cursor moved past them, so the cursor is cleared and the
// next round pulls everything again. Never edit the SQL once shipped (rule 6).
export const v6: Migration = {
  version: 6,
  name: 'original requests',
  sql: `
CREATE TABLE original_requests (
  id TEXT PRIMARY KEY NOT NULL,
  episode_id TEXT NOT NULL,
  documentary_id TEXT NOT NULL,
  moment_id TEXT NOT NULL REFERENCES moments (id),
  asset_id TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX original_requests_asset ON original_requests (asset_id);

DELETE FROM settings WHERE key = 'sync.cursor';
`,
};
