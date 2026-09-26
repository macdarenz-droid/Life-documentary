import { words } from '@life/story';
import { expect, test, type Page } from '@playwright/test';

const SECTIONS = [
  'Colour',
  'Type',
  'Buttons',
  'Field',
  'Title Card',
  'Text Morph',
  'Dissolve',
  'Grain and Breath',
];
/** Dwell per section so the recording walks the whole lab in about 20 s. */
const DWELL_MS = 2500;
const REDUCED_LABEL = words.lab.reducedMotionOn;
const REPLAY = words.lab.replay;
const FOCUSED_FIELD = 'A note, focused';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('the Design Lab shows every section without console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/design-lab');
  await expect(page.getByRole('heading', { name: 'Design lab' })).toBeVisible();
  await expect(page.getByText(REDUCED_LABEL)).toHaveCount(0);
  // The state Switch is decoration; screen readers get the text line only.
  await expect(page.getByRole('switch')).toHaveCount(0);

  for (const name of SECTIONS) {
    const heading = page.getByRole('heading', { name, exact: true });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();
    if (name === 'Field') {
      const focused = page.getByLabel(FOCUSED_FIELD, { exact: true });
      await focused.focus();
      await expect(focused).toBeFocused();
    }
    if (name === 'Title Card') {
      await page.getByRole('button', { name: REPLAY }).click();
    }
    await page.waitForTimeout(DWELL_MS);
  }
  expect(errors).toEqual([]);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the Design Lab says reduced motion is on', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/design-lab');
    await expect(page.getByText(REDUCED_LABEL)).toBeVisible();
    for (const name of SECTIONS) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeAttached();
    }
    expect(errors).toEqual([]);
  });
});
