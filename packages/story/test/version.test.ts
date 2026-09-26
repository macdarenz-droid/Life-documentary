import { expect, it } from 'vitest';
import { STORY_ENGINE_VERSION } from '../src';

it('exposes story engine version 1', () => {
  expect(STORY_ENGINE_VERSION).toBe(1);
});
