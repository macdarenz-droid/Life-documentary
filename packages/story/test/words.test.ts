import { describe, expect, it } from 'vitest';
import {
  bannedWords,
  questionTemplates,
  recapWords,
  voiceBannedCharacters,
  voiceBannedPhrases,
  words,
} from '../src';

function allStrings(value: unknown, path = 'words'): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => allStrings(v, `${path}.${key}`));
  }
  return [];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('words', () => {
  const strings = allStrings(words);

  it('has strings to check', () => {
    expect(strings.length).toBeGreaterThan(0);
  });

  it.each(strings)('%s uses no banned word', (_path, text) => {
    for (const banned of bannedWords) {
      expect(new RegExp(`\\b${escape(banned)}\\b`, 'i').test(text)).toBe(false);
    }
  });

  it.each(strings)('%s has no exclamation mark', (_path, text) => {
    expect(text).not.toContain('!');
  });
});

// Sample arguments for every function in `words` (DESIGN §8 voice test, T-012a).
const DATE = '2027-03-15';
const samples: Record<string, unknown[][]> = {
  'words.today.secondsLeft': [[1], [7]],
  'words.storylines.since': [[DATE]],
  'words.storylines.moments': [[1], [7]],
  'words.reminders.step': [
    ['hour', 1],
    ['hour', -1],
    ['minute', 1],
    ['minute', -1],
  ],
  'words.footage.seconds': [[1], [7]],
  'words.footage.minutes': [[1], [7]],
  'words.footage.rowLabel': [
    [
      {
        kind: words.footage.kinds.answer,
        time: '08:14',
        duration: words.footage.seconds(7),
        text: 'What stayed with you today?',
        onThisPhone: true,
      },
    ],
    [{ kind: words.footage.kinds.note, time: '10:30', text: 'Sam', mood: words.moods.calm }],
  ],
  'words.deletePage.codeSent': [['sam@example.com']],
  'words.deletePage.done': [[DATE]],
  'words.account.codeSent': [['sam@example.com']],
  'words.account.deleted': [[DATE]],
  'words.mail.codeText': [['123456']],
};

type Fn = (...args: unknown[]) => unknown;

/** Every string a person can see or hear from `words` (skipping the developer design lab). */
function userFacing(value: unknown, path = 'words'): [string, string][] {
  if (path === 'words.lab') return [];
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'function') {
    const calls = samples[path];
    if (!calls) throw new Error(`${path} has no sample arguments in the voice test`);
    return calls.flatMap((args, i) => userFacing((value as Fn)(...args), `${path}#${i}`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => userFacing(v, `${path}.${key}`));
  }
  return [];
}

function recapSample(): [string, string][] {
  return [
    ['recapWords.title', recapWords.title(DATE)],
    ['recapWords.summary', recapWords.summary(DATE, '2027-03-21')],
    ['recapWords.weekday', recapWords.weekday(DATE)],
    ['recapWords.merged', recapWords.merged('Monday', 'Wednesday')],
  ];
}

function hasPhrase(text: string, phrase: string): boolean {
  if (phrase.includes("'")) return text.toLowerCase().includes(phrase);
  return new RegExp(`\\b${escape(phrase)}\\b`, 'i').test(text);
}

describe('the voice (DESIGN §8)', () => {
  const strings = [
    ...userFacing(words),
    ...questionTemplates.map((q): [string, string] => [`question ${q.id}`, q.text]),
    ...recapSample(),
  ];

  it('calls every function in words with sample arguments', () => {
    expect(strings.some(([path]) => path.startsWith('words.footage.rowLabel#'))).toBe(true);
    expect(strings.some(([path]) => path.startsWith('question '))).toBe(true);
  });

  it.each(strings)('%s uses no stock phrase', (_path, text) => {
    expect(voiceBannedPhrases.filter((phrase) => hasPhrase(text, phrase))).toEqual([]);
  });

  it.each(strings)('%s uses no banned character', (_path, text) => {
    expect(voiceBannedCharacters.filter((ch) => text.includes(ch))).toEqual([]);
  });
});
