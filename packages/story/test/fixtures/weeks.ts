// Twenty synthetic weeks of device rows in the weekBrief input shape. Pure and deterministic: fixed
// UUIDs and fixed text, no randomness. Used by every later story test and the P13 evaluation set.
import {
  CastMember,
  Derived,
  MediaAsset,
  Moment,
  Question,
  Storyline,
  Uuid,
  type LocalDate,
  type MomentKind,
  type MomentMood,
} from '@life/contracts';
import { addDays, type WeekBriefInput } from '../../src';

export type FixtureWeek = { name: string; input: WeekBriefInput };

/** A fixed UUID: week number and a serial inside the week. */
export function fixtureId(week: number, n: number): Uuid {
  const hex = (week * 100_000 + n).toString(16).padStart(12, '0');
  return Uuid.parse(`00000000-0000-4000-8000-${hex}`);
}

const OWNER = fixtureId(0, 1);
const DOC = fixtureId(0, 2);
const WORDS =
  'we walked down to the water and talked about the move the new desk the long train home and what comes next';

function sentence(words: number, offset = 0): string {
  const all = WORDS.split(' ');
  return Array.from({ length: words }, (_, i) => all[(i + offset) % all.length]).join(' ');
}

type MomentSpec = {
  kind: MomentKind;
  /** Day offset from weekStart. */
  day: number;
  /** UTC time of day, HH:MM, or a full UTC timestamp. */
  at?: string;
  timeZone?: string;
  localOnly?: boolean;
  deleted?: boolean;
  derived?: boolean;
  transcriptWords?: number;
  noteChars?: number;
  mood?: MomentMood;
  placeName?: string;
  /** Indexes into the week's storylines and cast. */
  storylines?: number[];
  cast?: number[];
  /** Ids that reference nothing known. */
  strayIds?: { storylines?: Uuid[]; cast?: Uuid[] };
};

type WeekSpec = {
  name: string;
  week: number;
  weekStart: LocalDate;
  timeZone?: string;
  moments?: MomentSpec[];
  storylines?: { title: string; openedAt: string; closedAt?: string }[];
  cast?: { name: string; relation?: string }[];
  /** Questions asked on days (offsets) that got no answer. */
  unansweredDays?: number[];
  previousSummaries?: string[];
  episodeNumber?: number;
};

const NOW = '2027-01-01T00:00:00Z';

function buildWeek(spec: WeekSpec): FixtureWeek {
  const timeZone = spec.timeZone ?? 'Europe/Berlin';
  let serial = 10;
  const next = () => fixtureId(spec.week, serial++);

  const storylines = (spec.storylines ?? []).map((s) =>
    Storyline.parse({
      id: next(),
      documentaryId: DOC,
      title: s.title,
      openedAt: s.openedAt,
      ...(s.closedAt ? { closedAt: s.closedAt } : {}),
      updatedAt: NOW,
    }),
  );
  const cast = (spec.cast ?? []).map((c) =>
    CastMember.parse({ id: next(), documentaryId: DOC, ...c, createdAt: NOW, updatedAt: NOW }),
  );

  const moments: Moment[] = [];
  const mediaAssets: MediaAsset[] = [];
  const derived: Derived[] = [];
  const questions: Question[] = [];

  (spec.moments ?? []).forEach((m, i) => {
    const date = addDays(spec.weekStart, m.day);
    const capturedAt = m.at?.includes('T') ? m.at : `${date}T${m.at ?? '12:00'}:00Z`;
    const id = next();
    const hasMedia = m.kind !== 'note';
    const assetId = hasMedia ? next() : undefined;
    if (assetId) {
      const video = m.kind !== 'photo';
      mediaAssets.push(
        MediaAsset.parse({
          id: assetId,
          ownerUserId: OWNER,
          kind: video ? 'video' : 'photo',
          ...(video ? { durationMs: 6000 + i * 100 } : {}),
          width: 1080,
          height: 1920,
          bytes: 1_000_000 + i,
          sha256: (i + 1).toString(16).padStart(64, '0'),
          localPath: `media/${assetId}.enc`,
          wrappedKey: 'a2V5',
          uploadState: 'local',
          createdAt: capturedAt,
        }),
      );
    }
    let questionId: Uuid | undefined;
    if (m.kind === 'answer') {
      // One question a day; later answers on the same day answer the same question.
      const asked = questions.find((q) => q.askedOn === date);
      questionId = asked?.id ?? next();
      if (!asked) {
        questions.push(
          Question.parse({
            id: questionId,
            documentaryId: DOC,
            templateId: 'q080',
            reason: 'general',
            askedOn: date,
            text: `What stayed with you from day ${m.day + 1}?`,
            answeredByMomentId: id,
          }),
        );
      }
    }
    moments.push(
      Moment.parse({
        id,
        documentaryId: DOC,
        authorUserId: OWNER,
        capturedAt,
        timeZone: m.timeZone ?? timeZone,
        kind: m.kind,
        ...(questionId ? { questionId } : {}),
        ...(assetId ? { mediaAssetId: assetId } : {}),
        ...(m.kind === 'note'
          ? {
              text: sentence(4, i)
                .padEnd(m.noteChars ?? 0, ' and more')
                .slice(0, 500),
            }
          : {}),
        ...(m.mood ? { mood: m.mood } : {}),
        ...(m.placeName ? { placeName: m.placeName } : {}),
        localOnly: m.localOnly ?? false,
        storylineIds: [
          ...(m.storylines ?? []).flatMap((n) => storylines[n]?.id ?? []),
          ...(m.strayIds?.storylines ?? []),
        ],
        castIds: [...(m.cast ?? []).flatMap((n) => cast[n]?.id ?? []), ...(m.strayIds?.cast ?? [])],
        updatedAt: capturedAt,
        ...(m.deleted ? { deletedAt: capturedAt } : {}),
      }),
    );
    if (hasMedia && (m.derived ?? true)) {
      const isPhoto = m.kind === 'photo';
      derived.push(
        Derived.parse({
          id: fixtureId(spec.week, 50_000 + i),
          momentId: id,
          ...(isPhoto
            ? { caption: sentence(12, i) }
            : { transcript: sentence(m.transcriptWords ?? 30, i) }),
          language: 'en',
          provider: 'workersAi',
          modelVersion: 'fixture-1',
          producedAt: capturedAt,
        }),
      );
    }
  });

  for (const day of spec.unansweredDays ?? []) {
    questions.push(
      Question.parse({
        id: next(),
        documentaryId: DOC,
        templateId: 'q081',
        reason: 'general',
        askedOn: addDays(spec.weekStart, day),
        text: 'What did the evening sound like today?',
      }),
    );
  }

  return {
    name: spec.name,
    input: {
      documentaryId: DOC,
      episodeNumber: spec.episodeNumber ?? spec.week,
      weekStart: spec.weekStart,
      timeZone,
      moments,
      mediaAssets,
      derived,
      questions,
      storylines,
      cast,
      previousSummaries: spec.previousSummaries ?? [],
    },
  };
}

const every = (kind: MomentKind, days: number[], extra: Partial<MomentSpec> = {}): MomentSpec[] =>
  days.map((day) => ({ kind, day, ...extra }));
const week7 = [0, 1, 2, 3, 4, 5, 6];

/** Stable ids of rows the tests look at, by week name. */
export const NAMES = {
  full: 'full week',
  quiet: 'quiet week',
  single: 'single answer',
  photos: 'photos only',
  private: 'three local-only and one deleted',
  storylines: 'two open storylines and four cast members',
  dublin: 'Europe/Dublin across the DST change',
  manila: 'Asia/Manila week',
  midnight: 'moments around local midnight',
  heavy: 'heavy week over budget',
  noDerived: 'answers without derived text yet',
} as const;

export function fixtureWeeks(): FixtureWeek[] {
  const specs: WeekSpec[] = [
    {
      name: NAMES.full,
      week: 1,
      weekStart: '2027-03-01',
      moments: [
        ...every('answer', week7, { mood: 'calm' }),
        ...every('clip', [1, 3, 5], { placeName: 'The harbour' }),
        ...every('photo', [0, 2, 6]),
        ...every('note', [4, 6]),
      ],
      unansweredDays: [],
      previousSummaries: ['Week one.', 'Week two.', 'Week three.', 'Week four.'],
    },
    { name: NAMES.quiet, week: 2, weekStart: '2027-03-08', unansweredDays: [0, 1, 2] },
    { name: NAMES.single, week: 3, weekStart: '2027-03-15', moments: [{ kind: 'answer', day: 2 }] },
    {
      name: NAMES.photos,
      week: 4,
      weekStart: '2027-03-22',
      moments: every('photo', [0, 1, 1, 4, 6]),
    },
    {
      name: NAMES.private,
      week: 5,
      weekStart: '2027-03-29',
      moments: [
        ...every('answer', [0, 2, 4]),
        { kind: 'answer', day: 1, localOnly: true },
        { kind: 'clip', day: 3, localOnly: true },
        { kind: 'note', day: 5, localOnly: true },
        { kind: 'photo', day: 6, deleted: true },
      ],
    },
    {
      name: NAMES.storylines,
      week: 6,
      weekStart: '2027-04-05',
      storylines: [
        { title: 'The new job', openedAt: '2027-02-01T08:00:00Z' },
        { title: 'Training for the half marathon', openedAt: '2027-04-01T08:00:00Z' },
      ],
      cast: [
        { name: 'Maya', relation: 'sister' },
        { name: 'Ben' },
        { name: 'Aunt Rosa', relation: 'aunt' },
        { name: 'Tom', relation: 'colleague' },
      ],
      moments: [
        { kind: 'answer', day: 0, storylines: [0], cast: [0, 1] },
        { kind: 'clip', day: 2, storylines: [1], cast: [2] },
        { kind: 'answer', day: 4, storylines: [0, 1], cast: [3] },
        { kind: 'photo', day: 6 },
      ],
    },
    {
      name: NAMES.dublin,
      week: 7,
      weekStart: '2026-10-19',
      timeZone: 'Europe/Dublin',
      moments: [
        { kind: 'answer', day: 4, at: '2026-10-23T22:30:00Z' },
        { kind: 'answer', day: 5, at: '2026-10-24T23:30:00Z' },
        { kind: 'clip', day: 6, at: '2026-10-25T23:30:00Z' },
      ],
    },
    {
      name: NAMES.manila,
      week: 8,
      weekStart: '2027-05-03',
      timeZone: 'Asia/Manila',
      moments: [
        { kind: 'answer', day: 0, at: '2027-05-02T17:00:00Z' },
        ...every('answer', [1, 2, 3], { at: '03:00' }),
        { kind: 'photo', day: 6, at: '2027-05-09T15:30:00Z' },
      ],
    },
    {
      name: NAMES.midnight,
      week: 9,
      weekStart: '2027-05-10',
      moments: [
        // Europe/Berlin is UTC+2 in May: 21:59Z is 23:59 local, 22:01Z is 00:01 the next day.
        { kind: 'answer', day: 1, at: '2027-05-11T21:59:00Z' },
        { kind: 'note', day: 2, at: '2027-05-11T22:01:00Z' },
        { kind: 'clip', day: 6, at: '2027-05-16T21:59:00Z' },
        { kind: 'photo', day: 7, at: '2027-05-16T22:01:00Z' },
        { kind: 'answer', day: 0, at: '2027-05-09T21:59:00Z' },
      ],
    },
    {
      name: NAMES.heavy,
      week: 10,
      weekStart: '2027-05-17',
      moments: [
        ...Array.from({ length: 28 }, (_, i): MomentSpec => ({
          kind: 'answer',
          day: i % 7,
          transcriptWords: 400,
        })),
        ...Array.from({ length: 12 }, (_, i): MomentSpec => ({
          kind: 'clip',
          day: i % 7,
          transcriptWords: 20,
        })),
        ...Array.from({ length: 20 }, (_, i): MomentSpec => ({ kind: 'photo', day: i % 7 })),
        ...Array.from({ length: 160 }, (_, i): MomentSpec => ({
          kind: 'note',
          day: i % 7,
          noteChars: 400,
        })),
      ],
    },
    {
      name: NAMES.noDerived,
      week: 11,
      weekStart: '2027-05-24',
      moments: every('answer', [0, 2, 4, 6], { derived: false }),
    },
    { name: 'clips only', week: 12, weekStart: '2027-05-31', moments: every('clip', [0, 2, 3, 5]) },
    { name: 'notes only', week: 13, weekStart: '2027-06-07', moments: every('note', [1, 4]) },
    {
      name: 'a storyline closed mid-week',
      week: 14,
      weekStart: '2027-06-14',
      storylines: [
        {
          title: 'Moving house',
          openedAt: '2027-05-01T08:00:00Z',
          closedAt: '2027-06-17T18:00:00Z',
        },
      ],
      moments: every('answer', [0, 1, 2]),
    },
    {
      name: 'unanswered questions',
      week: 15,
      weekStart: '2027-06-21',
      moments: every('answer', [1, 3]),
      unansweredDays: [0, 2, 4, 5, 6],
    },
    {
      name: 'every mood',
      week: 16,
      weekStart: '2027-06-28',
      moments: (['bright', 'calm', 'tender', 'tired', 'heavy'] as const).map(
        (mood, day): MomentSpec => ({ kind: 'answer', day, mood }),
      ),
    },
    {
      name: 'references to unknown storylines and cast',
      week: 17,
      weekStart: '2027-07-05',
      moments: [
        {
          kind: 'answer',
          day: 0,
          strayIds: { storylines: [fixtureId(99, 1)], cast: [fixtureId(99, 2)] },
        },
        { kind: 'clip', day: 3, strayIds: { cast: [fixtureId(99, 3)] } },
      ],
    },
    {
      name: 'a busy weekend',
      week: 18,
      weekStart: '2027-07-12',
      moments: [
        ...every('clip', [5, 5, 5, 6, 6]),
        ...every('photo', [5, 6, 6]),
        { kind: 'answer', day: 6 },
      ],
    },
    {
      name: 'places every day',
      week: 19,
      weekStart: '2027-07-19',
      moments: week7.map((day): MomentSpec => ({
        kind: 'answer',
        day,
        placeName: `Stop ${day + 1}`,
      })),
    },
    {
      name: 'a first episode',
      week: 20,
      weekStart: '2027-01-04',
      episodeNumber: 1,
      moments: [
        { kind: 'answer', day: 0 },
        { kind: 'note', day: 0 },
        { kind: 'photo', day: 3 },
      ],
    },
  ];

  return specs.map(buildWeek);
}
