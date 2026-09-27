import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { Uuid } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import { database } from '../src/data/db';
import * as costLedger from '../src/data/repositories/costLedger';
import * as episodes from '../src/data/repositories/episodes';
import { captionMicroUsd, episodeCostCents, transcribeMicroUsd } from '../src/policy/costs';
import { bindings } from './session';

const T0 = '2027-03-21T18:00:00.000Z';

/** A user and a documentary stored straight into `d1`. */
async function documentaryIn(d1: D1Database): Promise<Uuid> {
  const userId = crypto.randomUUID();
  const documentaryId = crypto.randomUUID() as Uuid;
  await d1
    .prepare("INSERT INTO user (id, name, email, email_verified) VALUES (?, '', ?, 1)")
    .bind(userId, `${userId}@example.com`)
    .run();
  await d1
    .prepare(
      `INSERT INTO documentaries (id, owner_user_id, title, kind, time_zone, episode_day, episode_hour, created_at, updated_at)
       VALUES (?, ?, 'Kept', 'solo', 'Europe/Berlin', 0, 18, ?, ?)`,
    )
    .bind(documentaryId, userId, T0, T0)
    .run();
  return documentaryId;
}

describe('episodes', () => {
  it('gives one episode for a week asked for twice and numbers the next week 2', async () => {
    const db = database(bindings.DB);
    const documentaryId = await documentaryIn(bindings.DB);
    const first = await episodes.getOrCreate(db, documentaryId, '2027-03-15', T0);
    const again = await episodes.getOrCreate(db, documentaryId, '2027-03-15', T0);
    expect(again).toEqual(first);
    expect(first).toMatchObject({
      number: 1,
      weekStart: '2027-03-15',
      weekEnd: '2027-03-21',
      state: 'scheduled',
      costCents: 0,
    });
    const next = await episodes.getOrCreate(db, documentaryId, '2027-03-22', T0);
    expect(next.number).toBe(2);
    expect(next.id).not.toBe(first.id);
  });

  it('records the state and the cost', async () => {
    const db = database(bindings.DB);
    const documentaryId = await documentaryIn(bindings.DB);
    const episode = await episodes.getOrCreate(db, documentaryId, '2027-03-15', T0);
    await episodes.setState(db, episode.id, 'understanding', '2027-03-21T18:01:00.000Z');
    await episodes.setCostCents(db, episode.id, 3, '2027-03-21T18:02:00.000Z');
    expect(await episodes.get(db, episode.id)).toMatchObject({
      state: 'understanding',
      costCents: 3,
      updatedAt: '2027-03-21T18:02:00.000Z',
    });
  });
});

describe('the cost ledger', () => {
  it('keeps one row per episode, step and unit when the same step is recorded again', async () => {
    const db = database(bindings.DB);
    const documentaryId = await documentaryIn(bindings.DB);
    const episode = await episodes.getOrCreate(db, documentaryId, '2027-03-15', T0);
    const row = {
      episodeId: episode.id,
      step: 'caption',
      provider: 'anthropic',
      unit: 'inputToken',
      units: 972,
      microUsd: 486,
      at: T0,
    } as const;
    await costLedger.upsert(db, row);
    const [first] = await costLedger.forEpisode(db, episode.id);
    await costLedger.upsert(db, row);
    expect(await costLedger.forEpisode(db, episode.id)).toEqual([first]);
    await costLedger.upsert(db, { ...row, units: 1000, microUsd: 500 });
    expect(await costLedger.forEpisode(db, episode.id)).toEqual([
      { ...first, units: 1000, microUsd: 500 },
    ]);
    await costLedger.upsert(db, { ...row, unit: 'outputToken', units: 40, microUsd: 100 });
    expect(await costLedger.forEpisode(db, episode.id)).toHaveLength(2);
  });
});

describe('costs', () => {
  it('prices 10 s of audio at 86 µUSD', () => {
    expect(transcribeMicroUsd(10)).toBe(86);
    expect(transcribeMicroUsd(60)).toBe(513);
    expect(transcribeMicroUsd(0)).toBe(0);
  });

  it('prices 972 input and 40 output tokens at 586 µUSD', () => {
    expect(captionMicroUsd(972, 40)).toBe(586);
    expect(captionMicroUsd(1, 1)).toBe(4);
  });

  it('rounds the episode total up to whole cents', () => {
    expect(episodeCostCents([{ microUsd: 86 }, { microUsd: 586 }])).toBe(1);
    expect(episodeCostCents([{ microUsd: 10_000 }, { microUsd: 10_000 }])).toBe(2);
    expect(episodeCostCents([{ microUsd: 10_000 }, { microUsd: 10_001 }])).toBe(3);
    expect(episodeCostCents([])).toBe(0);
  });

  it('counts whole units only', () => {
    expect(() => transcribeMicroUsd(1.5)).toThrow();
    expect(() => captionMicroUsd(-1, 0)).toThrow();
  });
});

describe('migration 0004', () => {
  it('adds episodes, derived and cost_ledger and keeps the rows before it', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0004_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0004_'));
    expect(next).toHaveLength(1);
    await applyD1Migrations(MIGRATION_DB, before);
    const documentaryId = await documentaryIn(MIGRATION_DB);

    await applyD1Migrations(MIGRATION_DB, next);
    const tables = await MIGRATION_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('episodes', 'derived', 'cost_ledger') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map((t) => t.name)).toEqual(['cost_ledger', 'derived', 'episodes']);
    const kept = await MIGRATION_DB.prepare('SELECT title FROM documentaries WHERE id = ?')
      .bind(documentaryId)
      .first<{ title: string }>();
    expect(kept?.title).toBe('Kept');

    // Each table is unique on its natural key.
    const insertEpisode = (id: string) =>
      MIGRATION_DB.prepare(
        `INSERT INTO episodes (id, documentary_id, number, week_start, week_end, state, plan_version, render_version, cost_cents, updated_at)
         VALUES (?, ?, 1, '2027-03-15', '2027-03-21', 'scheduled', 0, 0, 0, ?)`,
      )
        .bind(id, documentaryId, T0)
        .run();
    const episodeId = crypto.randomUUID();
    await insertEpisode(episodeId);
    await expect(insertEpisode(crypto.randomUUID())).rejects.toThrow();

    const insertCost = () =>
      MIGRATION_DB.prepare(
        `INSERT INTO cost_ledger (id, episode_id, step, provider, unit, units, micro_usd, at)
         VALUES (?, ?, 'plan', 'anthropic', 'cacheReadToken', 10, 1, ?)`,
      )
        .bind(crypto.randomUUID(), episodeId, T0)
        .run();
    // Later steps and units need no rebuild: the columns take any text.
    await insertCost();
    await expect(insertCost()).rejects.toThrow();

    const momentId = crypto.randomUUID();
    await MIGRATION_DB.prepare(
      `INSERT INTO moments (id, documentary_id, author_user_id, captured_at, time_zone, kind, text, local_only, storyline_ids, cast_ids, updated_at)
       VALUES (?, ?, ?, ?, 'Europe/Berlin', 'note', 'Hi', 0, '[]', '[]', ?)`,
    )
      .bind(momentId, documentaryId, crypto.randomUUID(), T0, T0)
      .run();
    const insertDerived = () =>
      MIGRATION_DB.prepare(
        `INSERT INTO derived (id, documentary_id, moment_id, transcript, language, provider, model_version, produced_at)
         VALUES (?, ?, ?, 'Hi.', 'en', 'workersAi', 'fixture-1', ?)`,
      )
        .bind(crypto.randomUUID(), documentaryId, momentId, T0)
        .run();
    await insertDerived();
    await expect(insertDerived()).rejects.toThrow();
  });
});
