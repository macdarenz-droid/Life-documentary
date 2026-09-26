import { QuestionTag, QuestionTemplate } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import { bannedWords, questionTemplates } from '../src';

const minimumPerTag: Record<QuestionTag, number> = {
  open_storyline: 20,
  after_quiet_days: 12,
  anniversary: 8,
  person_seen: 16,
  place_first_time: 10,
  weekday: 20,
  weekend: 16,
  season: 8,
  general: 30,
};
const slotOf: Partial<Record<QuestionTag, string>> = {
  open_storyline: '{storyline}',
  person_seen: '{person}',
  place_first_time: '{place}',
};
const guilt = ['you missed', 'you forgot', 'finally'];

describe('questionTemplates', () => {
  it('every template parses', () => {
    for (const t of questionTemplates)
      expect(QuestionTemplate.safeParse(t).success, t.id).toBe(true);
  });

  it('ids are unique and run from q001 without gaps', () => {
    expect(questionTemplates.map((t) => t.id)).toEqual(
      questionTemplates.map((_, i) => `q${String(i + 1).padStart(3, '0')}`),
    );
  });

  it('has at least 140 templates and meets every per-tag minimum', () => {
    expect(questionTemplates.length).toBeGreaterThanOrEqual(140);
    for (const tag of QuestionTag.options) {
      const count = questionTemplates.filter((t) => t.tags.includes(tag)).length;
      expect(count, tag).toBeGreaterThanOrEqual(minimumPerTag[tag]);
    }
  });

  it('every text is one question with no exclamation, banned word or guilt', () => {
    for (const { id, text } of questionTemplates) {
      expect(text.endsWith('?'), id).toBe(true);
      expect(text.indexOf('?'), id).toBe(text.length - 1);
      expect(text.includes('!'), id).toBe(false);
      for (const word of [...bannedWords, ...guilt]) {
        expect(new RegExp(`\\b${word}\\b`, 'i').test(text), `${id} contains "${word}"`).toBe(false);
      }
    }
  });

  it('slot templates carry exactly their slot and one tag; the others have no slot', () => {
    for (const { id, tags, text } of questionTemplates) {
      const slotTag = tags.find((tag) => slotOf[tag] !== undefined);
      if (slotTag) {
        expect(tags, id).toEqual([slotTag]);
        const slot = slotOf[slotTag] ?? '';
        expect(text.split(slot).length - 1, id).toBe(1);
        expect(text.replace(slot, '').includes('{'), id).toBe(false);
      } else {
        expect(text.includes('{'), id).toBe(false);
      }
    }
  });
});
