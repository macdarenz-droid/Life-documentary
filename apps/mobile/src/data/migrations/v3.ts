import type { Migration } from './types';

// Schema v3 (P10): a media asset's encrypted poster, its path and its wrapped key, both nullable and
// set together. Never edit this text once shipped (CLAUDE.md rule 6). Device-only for now: D1 has no
// media asset table yet, so P6 carries the columns when it adds one.
export const v3: Migration = {
  version: 3,
  name: 'media asset posters',
  sql: `
ALTER TABLE media_assets ADD COLUMN poster_path TEXT;
ALTER TABLE media_assets ADD COLUMN poster_wrapped_key TEXT;
`,
};
