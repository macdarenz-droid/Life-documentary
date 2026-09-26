// Migrates a memory database to v1 and inserts one row in every table, so the next schema version's
// migration test starts from real v1 data (CLAUDE.md rule 6).
import type { SqlDriver } from '../../sqlite/driver';
import { openMemoryDriver } from '../../sqlite/testing/memoryDriver';
import { migrate } from '../migrate';
import { v1 } from '../v1';

export const SEED_NOW = '2027-03-15T09:30:00Z';
export const seedIds = {
  documentary: '00000000-0000-4000-8000-000000000001',
  owner: '00000000-0000-4000-8000-000000000002',
  asset: '00000000-0000-4000-8000-000000000003',
  storyline: '00000000-0000-4000-8000-000000000004',
  cast: '00000000-0000-4000-8000-000000000005',
  question: '00000000-0000-4000-8000-000000000006',
  moment: '00000000-0000-4000-8000-000000000007',
  episode: '00000000-0000-4000-8000-000000000008',
} as const;

export async function seedV1(): Promise<SqlDriver> {
  const db = await openMemoryDriver();
  await migrate(db, SEED_NOW, [v1]);
  const id = seedIds;
  const now = SEED_NOW;
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO documentaries (id, owner_user_id, title, kind, time_zone, episode_day, episode_hour, created_at, updated_at)
       VALUES (?, ?, 'My year', 'solo', 'Europe/Berlin', 0, 18, ?, ?)`,
      [id.documentary, id.owner, now, now],
    );
    await tx.run(
      `INSERT INTO media_assets (id, owner_user_id, kind, duration_ms, width, height, bytes, sha256, local_path, wrapped_key, upload_state, created_at)
       VALUES (?, ?, 'video', 9000, 1080, 1920, 4200000, ?, 'media/a.enc', 'a2V5', 'queued', ?)`,
      [id.asset, id.owner, 'a'.repeat(64), now],
    );
    await tx.run(
      `INSERT INTO storylines (id, documentary_id, title, opened_at, updated_at) VALUES (?, ?, 'The new job', ?, ?)`,
      [id.storyline, id.documentary, now, now],
    );
    await tx.run(
      `INSERT INTO cast_members (id, documentary_id, name, relation, created_at, updated_at) VALUES (?, ?, 'Maya', 'sister', ?, ?)`,
      [id.cast, id.documentary, now, now],
    );
    await tx.run(
      `INSERT INTO questions (id, documentary_id, template_id, reason, asked_on, storyline_id, text)
       VALUES (?, ?, 'q001', 'open_storyline', '2027-03-15', ?, 'Where are things with The new job this week?')`,
      [id.question, id.documentary, id.storyline],
    );
    await tx.run(
      `INSERT INTO moments (id, documentary_id, author_user_id, captured_at, time_zone, local_day, kind, question_id, media_asset_id, mood, local_only, updated_at)
       VALUES (?, ?, ?, ?, 'Europe/Berlin', '2027-03-15', 'answer', ?, ?, 'calm', 0, ?)`,
      [id.moment, id.documentary, id.owner, now, id.question, id.asset, now],
    );
    await tx.run('UPDATE questions SET answered_by_moment_id = ? WHERE id = ?', [
      id.moment,
      id.question,
    ]);
    await tx.run('INSERT INTO moment_storylines (moment_id, storyline_id) VALUES (?, ?)', [
      id.moment,
      id.storyline,
    ]);
    await tx.run('INSERT INTO moment_cast (moment_id, cast_id) VALUES (?, ?)', [
      id.moment,
      id.cast,
    ]);
    await tx.run(
      `INSERT INTO episodes (id, documentary_id, number, week_start, week_end, state, plan_version, render_version, cost_cents, updated_at)
       VALUES (?, ?, 1, '2027-03-08', '2027-03-14', 'ready', 1, 1, 42, ?)`,
      [id.episode, id.documentary, now],
    );
    await tx.run(
      `INSERT INTO upload_jobs (asset_id, state, upload_id, bytes_done, attempts, updated_at) VALUES (?, 'uploading', 'up-1', 0, 1, ?)`,
      [id.asset, now],
    );
    await tx.run(`INSERT INTO upload_job_parts (asset_id, part_number, etag) VALUES (?, 1, 'e1')`, [
      id.asset,
    ]);
  });
  return db;
}
