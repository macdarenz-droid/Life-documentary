import type { Migration } from './types';

// Schema v7 (P16, D42): the phone's episodes become the pulled summary, with the path and render version
// of the copy it downloaded. The table has existed since v1 without storage keys ever mattering here,
// so it is rebuilt: every earlier row keeps its id, week, state, render version, duration and times.
// `state` has no CHECK list: the DeviceEpisode contract guards it (as v4 did for `purpose`). Never edit
// this text once shipped (rule 6).
export const v7: Migration = {
  version: 7,
  name: 'episode summaries',
  sql: `
CREATE TABLE episodes_v7 (
  id TEXT PRIMARY KEY NOT NULL,
  documentary_id TEXT NOT NULL REFERENCES documentaries (id),
  number INTEGER NOT NULL CHECK (number >= 1),
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  state TEXT NOT NULL,
  title TEXT,
  duration_ms INTEGER,
  render_version INTEGER NOT NULL CHECK (render_version >= 0),
  due_at TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL,
  local_path TEXT,
  local_render_version INTEGER
);

INSERT INTO episodes_v7
  (id, documentary_id, number, week_start, week_end, state, duration_ms, render_version, delivered_at,
   updated_at)
SELECT id, documentary_id, number, week_start, week_end, state, duration_ms, render_version, delivered_at,
  updated_at
FROM episodes;

DROP TABLE episodes;
ALTER TABLE episodes_v7 RENAME TO episodes;
CREATE INDEX episodes_documentary_number ON episodes (documentary_id, number);
`,
};
