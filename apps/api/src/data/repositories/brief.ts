// What the planner's brief is built from (P13, D39): the week's moments that may leave the phone (rule 8),
// their assets' durations and derived text, the week's questions, the documentary's storylines and cast,
// and the summaries of the last three earlier episodes whose plan is the model's (recaps carry no story).
import type { CastMember, Episode, PulledChange, Question, Storyline } from '@life/contracts';
import { addDays, leavesDevice, type WeekBriefInput } from '@life/story';
import { and, between, desc, eq, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { castMembers, episodePlans, episodes, questions, storylines } from '../schema';
import * as derived from './derived';
import * as documentaries from './documentaries';
import * as rows from './sync';
import * as week from './week';

const PREVIOUS_SUMMARIES = 3;

/** The stored rows of one kind for these ids, in the same order. */
async function stored(
  db: Db,
  entity: PulledChange['entity'],
  ids: { id: string }[],
): Promise<PulledChange['row'][]> {
  const found = await rows.getMany(
    db,
    entity,
    ids.map((r) => r.id),
  );
  return ids.flatMap(({ id }) => {
    const change = found.get(id)?.change;
    return change?.entity === entity ? [change.row] : [];
  });
}

/** The summaries of the last three earlier episodes whose plan in use is a model plan, oldest first. */
export async function previousSummaries(db: Db, episode: Episode): Promise<string[]> {
  const found = await db
    .select({ summary: episodes.summary })
    .from(episodes)
    .innerJoin(
      episodePlans,
      and(eq(episodePlans.episodeId, episodes.id), eq(episodePlans.version, episodes.planVersion)),
    )
    .where(
      and(
        eq(episodes.documentaryId, episode.documentaryId),
        lt(episodes.number, episode.number),
        eq(episodePlans.createdBy, 'model'),
      ),
    )
    .orderBy(desc(episodes.number))
    .limit(PREVIOUS_SUMMARIES);
  return found.flatMap((r) => (r.summary ? [r.summary] : [])).reverse();
}

/** The `WeekBriefInput` for the episode's week. */
export async function briefInput(db: Db, episode: Episode): Promise<WeekBriefInput> {
  const documentary = await documentaries.get(db, episode.documentaryId);
  if (!documentary) throw new Error('The documentary of this episode is gone.');
  const weekEnd = addDays(episode.weekStart, 6);

  // The server applies the rule again (rule 8): a local-only moment and its text never go in.
  const moments = (await week.momentsOfWeek(db, episode.documentaryId, episode.weekStart)).filter(
    ({ moment, asset }) =>
      leavesDevice(asset ? { ...moment, assetKind: asset.kind } : moment, { cloudBackup: false })
        .row,
  );

  const questionIds = await db
    .select({ id: questions.id })
    .from(questions)
    .where(
      and(
        eq(questions.documentaryId, episode.documentaryId),
        between(questions.askedOn, episode.weekStart, weekEnd),
        isNull(questions.deletedAt),
      ),
    );
  const storylineIds = await db
    .select({ id: storylines.id })
    .from(storylines)
    .where(and(eq(storylines.documentaryId, episode.documentaryId), isNull(storylines.deletedAt)));
  const castIds = await db
    .select({ id: castMembers.id })
    .from(castMembers)
    .where(
      and(eq(castMembers.documentaryId, episode.documentaryId), isNull(castMembers.deletedAt)),
    );

  return {
    documentaryId: episode.documentaryId,
    episodeNumber: episode.number,
    weekStart: episode.weekStart,
    timeZone: documentary.timeZone,
    moments: moments.map((m) => m.moment),
    mediaAssets: moments.flatMap(({ asset }) =>
      asset
        ? [
            {
              id: asset.id,
              ...(asset.durationMs !== undefined ? { durationMs: asset.durationMs } : {}),
            },
          ]
        : [],
    ),
    derived: await derived.forMoments(
      db,
      moments.map((m) => m.moment.id),
    ),
    questions: (await stored(db, 'question', questionIds)) as Question[],
    storylines: (await stored(db, 'storyline', storylineIds)) as Storyline[],
    cast: (await stored(db, 'castMember', castIds)) as CastMember[],
    previousSummaries: await previousSummaries(db, episode),
  };
}
