import { test, expect } from '@playwright/test';
import { openPlayer, expectPanel, stubManifest } from './helpers/player';
import { conditionalManifest } from './fixtures/conditional-manifest';

/**
 * Checklist: "Hotspot interaction changes variant" — the real
 * panel-variant runtime (schema PanelVariant: first matching `when`
 * wins, `overrides` replace fields wholesale).
 *
 * Sample manifest: p1-3 has variant `var-alley-shortcut` gated on
 * `path.choice == "alley"`, which the p1-2 hotspot's goTo mutation
 * sets. The `.variant-active` chip shows the active variant id
 * (player-spec E2E contract).
 */

test.describe('panel variants', () => {
  test('plain navigation shows the base panel, no variant chip', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-3');
    await expect(page.locator('.t-frame [data-layer-id="ly-p1-3-bg"]')).toBeVisible();
    await expect(page.locator('.variant-active')).toHaveCount(0);
  });

  test('hotspot mutation activates the variant on the target panel', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-2');

    // goTo p1-3 with mutation path.choice = "alley".
    await page.getByRole('button', { name: 'Slip into the alley' }).click();

    // The variant's layers replace the base layer stack.
    await expect(page.locator('.t-frame [data-layer-id="ly-p1-3-bg-alt"]')).toBeVisible();
    await expect(page.locator('.t-frame [data-layer-id="ly-p1-3-bg"]')).toHaveCount(0);
    await expect(page.locator('.variant-active')).toContainText('var-alley-shortcut');

    // Navigating on and back keeps the variant (session variable persists).
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-4');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.t-frame [data-layer-id="ly-p1-3-bg-alt"]')).toBeVisible();
  });

  test('Alt toolbar button cycles variants manually and resets to auto', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-3');

    // The Alt button only renders on panels with variants.
    const altButton = page.getByRole('button', { name: 'Alternative panels' });
    await expect(altButton).toBeVisible();

    // No path.choice set -> auto selection = base panel.
    await expect(page.locator('.variant-active')).toHaveCount(0);

    // 1st click: force the first variant.
    await altButton.click();
    await expect(page.locator('.t-frame [data-layer-id="ly-p1-3-bg-alt"]')).toBeVisible();
    await expect(page.locator('.variant-active')).toContainText('var-alley-shortcut');

    // 2nd click: force the base panel.
    await altButton.click();
    await expect(page.locator('.t-frame [data-layer-id="ly-p1-3-bg"]')).toBeVisible();
    await expect(page.locator('.variant-active')).toHaveCount(0);

    // 3rd click: back to automatic (still base, nothing matches).
    await altButton.click();
    await expect(page.locator('.t-frame [data-layer-id="ly-p1-3-bg"]')).toBeVisible();

    // Panels without variants show no Alt button.
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-4');
    await expect(altButton).toHaveCount(0);
  });

  test('setVariables hotspot flips the variant of the same panel', async ({ page }) => {
    await stubManifest(page, conditionalManifest);
    await openPlayer(page);
    await expect(page.locator('.t-frame [data-layer-id="ly-pA-bg"]')).toBeVisible();

    await page.getByRole('button', { name: 'Take the lantern' }).click();

    // Variant replaced the layer stack in place; base hotspots survive
    // because the variant does not override `hotspots`.
    await expect(page.locator('.t-frame [data-layer-id="ly-pA-lit"]')).toBeVisible();
    await expect(page.locator('.t-frame [data-layer-id="ly-pA-bg"]')).toHaveCount(0);
    await expect(page.locator('.variant-active')).toContainText('var-lit');

    await page.getByRole('button', { name: 'Use the lantern' }).click();
    await expect(page.locator('.t-frame [data-layer-id="ly-pB-bg"]')).toBeVisible();
    await expect(page.locator('.variant-active')).toHaveCount(0);
  });

  test('variant durationMs drives autoplay timing', async ({ page }) => {
    // p1-3's variant does not override durationMs; this asserts the
    // effective panel (variant applied) still advances on the BASE
    // duration (2.5s), i.e. resolution does not break autoplay.
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Slip into the alley' }).click();
    await expect(page.locator('.t-frame [data-layer-id="ly-p1-3-bg-alt"]')).toBeVisible();

    await page.getByRole('button', { name: 'Enable/disable autoplay' }).click();
    await expectPanel(page, 'p1-4', 5_000);
  });
});
