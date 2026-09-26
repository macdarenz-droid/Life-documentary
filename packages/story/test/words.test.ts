import { describe, expect, it } from 'vitest';
import { bannedWords, words } from '../src';

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
