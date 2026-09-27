import { Question } from '@life/contracts';
import type { LocalDate } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { ConflictError } from './errors';
import { fromRow, selectRow, upsert, type Row, type TableSpec } from './table';

export const questionSpec: TableSpec<Question> = {
  table: 'questions',
  key: 'id',
  contract: Question,
  columns: {
    id: 'id',
    documentaryId: 'documentary_id',
    templateId: 'template_id',
    reason: 'reason',
    askedOn: 'asked_on',
    storylineId: 'storyline_id',
    text: 'text',
    answeredByMomentId: 'answered_by_moment_id',
  },
};

/** One question a day: a second question for the same documentary and day is a ConflictError. */
export async function put(driver: SqlDriver, question: Question): Promise<Question> {
  try {
    return await upsert(driver, questionSpec, question);
  } catch (error) {
    // Not `instanceof Error`: a native driver's error class can come from another JS realm (Jest workers).
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';
    if (/UNIQUE constraint failed: questions\.documentary_id, questions\.asked_on/.test(message)) {
      throw new ConflictError(`A question was already asked on ${question.askedOn}`);
    }
    throw error;
  }
}

export async function get(driver: SqlDriver, id: string): Promise<Question | undefined> {
  const row = await selectRow(driver, questionSpec, id);
  return row ? fromRow(questionSpec, row) : undefined;
}

export async function getForDay(
  driver: SqlDriver,
  documentaryId: string,
  day: LocalDate,
): Promise<Question | undefined> {
  const row = await driver.first<Row>(
    'SELECT * FROM questions WHERE documentary_id = ? AND asked_on = ?',
    [documentaryId, day],
  );
  return row ? fromRow(questionSpec, row) : undefined;
}

/** The question engine's history: every question from `fromDay` on, in askedOn order. */
export async function listSince(
  driver: SqlDriver,
  documentaryId: string,
  fromDay: LocalDate,
): Promise<Question[]> {
  const rows = await driver.all<Row>(
    'SELECT * FROM questions WHERE documentary_id = ? AND asked_on >= ? ORDER BY asked_on, id',
    [documentaryId, fromDay],
  );
  return rows.map((r) => fromRow(questionSpec, r));
}

export async function markAnswered(
  driver: SqlDriver,
  id: string,
  momentId: string,
): Promise<Question | undefined> {
  return driver.transaction(async (tx) => {
    const question = await get(tx, id);
    if (!question) return undefined;
    return put(tx, Question.parse({ ...question, answeredByMomentId: momentId }));
  });
}

/** Clears the answer when it is `momentId`'s, so the day's question can be answered again. */
export async function clearAnswer(
  driver: SqlDriver,
  id: string,
  momentId: string,
): Promise<Question | undefined> {
  return driver.transaction(async (tx) => {
    const question = await get(tx, id);
    if (!question || question.answeredByMomentId !== momentId) return question;
    return put(tx, Question.parse({ ...question, answeredByMomentId: undefined }));
  });
}
