// The moments an episode's current plan shows (cold open, shots, closing) that the rebuilt brief still
// has, with their assets (P16, D42). Rebuilding the brief applies `leavesDevice` again, so a moment
// deleted or made local-only since planning is not among them (rule 8).
import type { Episode, Moment } from '@life/contracts';
import { weekBrief } from '@life/story';
import type { Db } from '../../data/db';
import { briefInput } from '../../data/repositories/brief';
import * as plans from '../../data/repositories/plans';
import * as week from '../../data/repositories/week';
import { planMomentIds } from '../render/steps';

export type ChosenMoment = { moment: Moment; asset: week.WeekAsset };

export async function chosenMoments(db: Db, episode: Episode): Promise<ChosenMoment[]> {
  const stored = await plans.current(db, episode.id);
  if (!stored) return [];
  const inBrief = new Set(weekBrief(await briefInput(db, episode)).moments.map((m) => m.momentId));
  const byId = new Map(
    (await week.momentsOfWeek(db, episode.documentaryId, episode.weekStart)).map((m) => [
      m.moment.id,
      m,
    ]),
  );
  const chosen: ChosenMoment[] = [];
  for (const momentId of planMomentIds(stored.plan)) {
    const found = byId.get(momentId);
    if (!found?.asset || !inBrief.has(momentId)) continue;
    chosen.push({ moment: found.moment, asset: found.asset });
  }
  return chosen;
}
