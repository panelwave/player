import { test, expect } from '@playwright/test';
import { openPlayer, stubManifest } from './helpers/player';
import { variablesManifest } from './fixtures/variables-manifest';

/**
 * Variable seeding & editing:
 * - `[initialVariables]` (here via the demo's `?vars=` hook) seeds
 *   values at init through the privileged path, including variables the
 *   manifest declares `readOnly` — the channel for externally-sourced
 *   facts like a verified age.
 * - read-only variables resist in-story mutations (fail closed: an
 *   unknown age renders the softened variant).
 * - public variables are reader-editable in the settings modal's
 *   Variables tab and re-resolve variants on save.
 */

const layer = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`.t-frame [data-layer-id="${id}"]`);

test.describe('variable seeding and variants', () => {
  test('unknown age fails closed to the softened variant', async ({ page }) => {
    await stubManifest(page, variablesManifest);
    await openPlayer(page);
    await expect(layer(page, 'ly-safe')).toBeVisible();
    await expect(page.locator('.variant-active')).toContainText('var-younger');
  });

  test('seeded age 12 keeps the softened variant; age 18 unlocks the base panel', async ({
    page,
  }) => {
    await stubManifest(page, variablesManifest);
    await openPlayer(page, '?vars=' + encodeURIComponent('{"user.age":12}'));
    await expect(layer(page, 'ly-safe')).toBeVisible();

    await stubManifest(page, variablesManifest);
    await openPlayer(page, '?vars=' + encodeURIComponent('{"user.age":18}'));
    await expect(layer(page, 'ly-violent')).toBeVisible();
    await expect(page.locator('.variant-active')).toHaveCount(0);
  });

  test('read-only variables resist in-story mutations', async ({ page }) => {
    await stubManifest(page, variablesManifest);
    await openPlayer(page, '?vars=' + encodeURIComponent('{"user.age":12}'));
    await expect(layer(page, 'ly-safe')).toBeVisible();

    // The hotspot tries to set user.age = 99; the store rejects writes
    // to read-only definitions, so the softened variant must survive.
    await page.getByRole('button', { name: 'Hack the age' }).click();
    await expect(layer(page, 'ly-safe')).toBeVisible();
    await expect(layer(page, 'ly-violent')).toHaveCount(0);
  });

  test('public variables are editable in settings and flip variants', async ({ page }) => {
    await stubManifest(page, variablesManifest);
    await openPlayer(page);

    // style.mode defaults to "us": pStyle shows the base art.
    await page.keyboard.press('ArrowRight');
    await expect(layer(page, 'ly-us')).toBeVisible();

    await page.getByRole('button', { name: 'Open settings' }).click();
    const dialog = page.locator('.settings-container[role="dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Variables' }).click();

    // Only the public variable is offered; the read-only private age is not.
    const styleItem = dialog.locator('.variable-item', { hasText: 'style.mode' });
    await expect(styleItem).toBeVisible();
    await expect(dialog.locator('.variable-item', { hasText: 'user.age' })).toHaveCount(0);

    await styleItem.locator('select.setting-select').selectOption('eu');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toHaveCount(0);

    // The committee variant applies immediately.
    await expect(layer(page, 'ly-eu')).toBeVisible();
    await expect(page.locator('.variant-active')).toContainText('var-eu');

    // Cancel must NOT apply: switch back to "us" but cancel.
    await page.getByRole('button', { name: 'Open settings' }).click();
    await dialog.getByRole('tab', { name: 'Variables' }).click();
    await styleItem.locator('select.setting-select').selectOption('us');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(layer(page, 'ly-eu')).toBeVisible();
  });
});
