// Words for changing an episode (P17, D43): the Episode screen's buttons, the edit trays, where a re-cut
// stands and why a change couldn't be made. DESIGN §8: plain, sentence case, no exclamation marks.
import type { CutShotKind, EditRefusal, MusicMood } from '@life/contracts';
import { dayAndMonth } from './recap';

const KIND: Record<CutShotKind, string> = { answer: 'Answer', clip: 'Clip', photo: 'Photo' };

const REFUSALS: Partial<Record<EditRefusal, string>> = {
  sceneFull: 'This scene is full. Take out a clip first.',
  lastShot: 'An episode needs at least one clip.',
  tooShort: "It can't get shorter than 20 seconds.",
  tooLong: "It can't get longer than 4 minutes.",
  narratorTooLong: 'That line is too long for this episode. Try a shorter one.',
  hasNumbers: 'Write numbers as words, like "three".',
  noNarrator: "This episode doesn't have a narrator.",
  alreadyIn: "That answer's already in the episode.",
};

export const editWords = {
  rename: 'Rename',
  changeLine: 'Change a line',
  takeOut: 'Take out a clip',
  lastShot: 'Change the last shot',
  music: 'Change the music',

  titleField: 'Episode title',
  titleHint: 'Up to 60 characters.',

  lines: "Narrator's lines",
  noLine: 'No narrator line in this scene.',
  useAnswer: 'Use one of my answers',
  writeOwn: 'Write my own',
  lineField: 'Your line',
  lineHint: 'Up to 140 characters. Write numbers as words.',
  noAnswers: 'No other answers from this week on this phone.',

  clips: 'Clips',
  takeOutShot: 'Take out',
  /** "Photo from 14 October". */
  shotLabel: (kind: CutShotKind, date: string) => `${KIND[kind]} from ${dayAndMonth(date)}`,
  notOnPhone: 'Not on this phone',

  lastShotTray: 'Last shot',
  musicTray: 'Music',
  moods: {
    calm: 'Calm',
    warm: 'Warm',
    bright: 'Bright',
    bittersweet: 'Bittersweet',
    driving: 'Upbeat',
  } satisfies Record<MusicMood, string>,

  save: 'Save',

  working: 'Making the new cut. It takes a few minutes.',
  waiting: 'Waiting for your answer to send from this phone.',
  waitingWifi: "Your answer will send when you're on Wi-Fi.",
  failed: "Couldn't make that change. The episode is as it was.",
  limit: (n: number) => `That's ${n} changes today. You can change it again tomorrow.`,
  offline: "You're offline. Changes need a connection.",
  changed: 'This episode just changed. Have another look.',

  refusal: (reason: EditRefusal): string =>
    REFUSALS[reason] ?? "Couldn't make that change. Have another look and try again.",
};
