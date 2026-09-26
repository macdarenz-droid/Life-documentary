// Today's question: asked once per local day, chosen by the pure engine from what the store holds.
import { Question } from '@life/contracts';
import type { Documentary } from '@life/contracts';
import { addDays, localDay, oneYearBefore, pickQuestion, questionTemplates } from '@life/story';
import * as moments from '../data/repositories/moments';
import * as questions from '../data/repositories/questions';
import * as storylines from '../data/repositories/storylines';
import type { Clock, Ids, Store } from './ports';

const HISTORY_DAYS = 60;
const RECENT_DAYS = 7;

export async function todayQuestion(
  store: Store,
  documentary: Documentary,
  clock: Clock,
  ids: Ids,
): Promise<Question> {
  const { driver } = store;
  const today = clock.today(documentary.timeZone);
  const existing = await questions.getForDay(driver, documentary.id, today);
  if (existing) return existing;

  const windowStart = addDays(today, -RECENT_DAYS);
  const open = await storylines.listOpen(driver, documentary.id);
  const pick = pickQuestion({
    today,
    seed: documentary.id,
    templates: questionTemplates,
    openStorylines: open.map((s) => ({
      id: s.id,
      title: s.title,
      openedOn: localDay(s.openedAt, documentary.timeZone),
    })),
    recentDays: await moments.recentDaySummaries(
      driver,
      documentary.id,
      windowStart,
      addDays(today, -1),
    ),
    placesBefore: await moments.placesBefore(driver, documentary.id, windowStart),
    momentsOneYearAgo: await moments.momentCountOn(driver, documentary.id, oneYearBefore(today)),
    history: (await questions.listSince(driver, documentary.id, addDays(today, -HISTORY_DAYS))).map(
      (q) => ({
        askedOn: q.askedOn,
        templateId: q.templateId,
        ...(q.storylineId ? { storylineId: q.storylineId } : {}),
      }),
    ),
  });

  return questions.put(
    driver,
    Question.parse({
      id: ids.newId(),
      documentaryId: documentary.id,
      templateId: pick.templateId,
      reason: pick.reason,
      askedOn: today,
      text: pick.text,
      ...(pick.storylineId ? { storylineId: pick.storylineId } : {}),
    }),
  );
}
