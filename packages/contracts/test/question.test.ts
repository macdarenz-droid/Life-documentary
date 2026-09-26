import { describe, expect, it } from 'vitest';
import { QuestionPick, QuestionTemplate } from '../src';

describe('QuestionTemplate', () => {
  const valid = { id: 'q001', tags: ['general'], text: 'What made you laugh today?' };

  it('accepts a valid template', () => {
    expect(QuestionTemplate.safeParse(valid).success).toBe(true);
  });
  it('rejects an id without three digits', () => {
    expect(QuestionTemplate.safeParse({ ...valid, id: 'q1' }).success).toBe(false);
  });
  it('rejects an empty tag list', () => {
    expect(QuestionTemplate.safeParse({ ...valid, tags: [] }).success).toBe(false);
  });
  it('rejects a text longer than 120 characters', () => {
    expect(QuestionTemplate.safeParse({ ...valid, text: `${'a'.repeat(120)}?` }).success).toBe(
      false,
    );
  });
});

describe('QuestionPick', () => {
  const valid = {
    templateId: 'q001',
    reason: 'general',
    text: 'What made you laugh today?',
    storylineId: '3b241101-e2bb-4255-8caf-4136c566a962',
  };

  it('accepts a valid pick', () => {
    expect(QuestionPick.safeParse(valid).success).toBe(true);
  });
  it('rejects an unknown reason', () => {
    expect(QuestionPick.safeParse({ ...valid, reason: 'mood' }).success).toBe(false);
  });
  it('rejects a storylineId that is not a UUID', () => {
    expect(QuestionPick.safeParse({ ...valid, storylineId: 'storyline-1' }).success).toBe(false);
  });
  it('rejects a text with a slot left unfilled', () => {
    expect(
      QuestionPick.safeParse({ ...valid, text: 'Where are things with {storyline}?' }).success,
    ).toBe(false);
  });
});
