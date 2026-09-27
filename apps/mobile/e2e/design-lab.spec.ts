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
  'Today',
  'Storylines',
  'Cast',
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
  // The state Switch is decoration; screen readers get the text line only. The one switch they get is the
  // Today section's labelled "Keep on this phone" toggle.
  await expect(page.getByRole('switch')).toHaveCount(1);
  await expect(page.getByRole('switch', { name: words.extras.keepOnPhone })).toHaveCount(1);

  for (const name of SECTIONS) {
    // "Storylines" and "Cast" are also the screens' own headings; the section heading comes first.
    const heading = page.getByRole('heading', { name, exact: true }).first();
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();
    if (name === 'Field') {
      const focused = page.getByLabel(FOCUSED_FIELD, { exact: true });
      await focused.focus();
      await expect(focused).toBeFocused();
    }
    if (name === 'Today') {
      // Hold to answer for two seconds; the fake camera "records" and the answer shows as saved.
      // The Buttons section shows the same labels; the Today section comes after it.
      const hold = page.getByRole('button', { name: words.button.holdToAnswer }).last();
      await hold.scrollIntoViewIfNeeded();
      const box = await hold.boundingBox();
      if (!box) throw new Error('The record button has no box');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(2000);
      await page.mouse.up();
      await expect(page.getByRole('button', { name: words.button.saved }).last()).toBeVisible();
      await expect(page.getByRole('button', { name: words.button.holdToAnswer })).toHaveCount(1);
      // The quiet row opens the note tray.
      await page.getByRole('button', { name: words.extras.note, exact: true }).click();
      await expect(page.getByLabel(words.extras.noteLabel)).toBeVisible();
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: words.extras.close }).click();
    }
    if (name === 'Storylines') {
      // A row opens its tray; closing it leaves the list as it was.
      await page.getByRole('button', { name: /^The new job,/ }).click();
      await expect(page.getByRole('button', { name: words.storylines.close })).toBeVisible();
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: words.extras.close }).last().click();
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
      await expect(page.getByRole('heading', { name, exact: true }).first()).toBeAttached();
    }
    expect(errors).toEqual([]);
  });
});
