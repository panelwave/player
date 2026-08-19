import { test, expect } from '@playwright/test';
import { openPlayer, expectPanel, stubManifest } from './helpers/player';
import { conditionalManifest } from './fixtures/conditional-manifest';

/**
 * Checklist: "Hotspot interaction changes variant".
 *
 * Panel-level `variants` arrays are not consumed by the player yet
 * (tracked as an open gap), so these tests cover the conditional-content
 * mechanism that IS implemented: hotspot actions (goTo with mutations,
 * openModal, openExtras, setVariables) and JSON-Logic `visibleIf`
 * re-evaluation after mutations.
 *
 * Hotspots render as SVG shapes with role="button" and their localized
 * label as the accessible name; there is no id attribute in the DOM.
 */

test.describe('hotspot actions (sample manifest)', () => {
  test('goTo hotspot navigates with its transition', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-2');

    await page.getByRole('button', { name: 'Slip into the alley' }).click();
    await expectPanel(page, 'p1-3');
  });

  test('openModal hotspot shows the action modal, Escape closes it', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-2');

    await page.getByRole('button', { name: 'Read the neon sign' }).click();

    const modal = page.locator('pw-action-modal .action-modal-container');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.action-modal-title')).toHaveText('The Blue Oyster');
    await expect(modal.locator('.action-modal-content')).toContainText('OPEN ALL NIGHT');

    await page.keyboard.press('Escape');
    await expect(page.locator('pw-action-modal')).toHaveCount(0);
    // The modal must not have navigated anywhere.
    await expectPanel(page, 'p1-2');
  });

  test('openExtras hotspot opens the extras viewer on the linked extra', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-3');

    await page.getByRole('button', { name: 'Look at the torn poster' }).click();

    const viewer = page.locator('pw-extras-viewer');
    await expect(viewer.locator('.extras-container')).toBeVisible();
    // openExtras carries extrasId ex-cover -> detail view auto-opens.
    await expect(viewer.locator('.detail-title')).toHaveText('Cover');

    await viewer.getByRole('button', { name: 'Close detail view' }).click();
    await viewer.getByRole('button', { name: 'Close extras viewer' }).click();
    await expect(page.locator('pw-extras-viewer')).toHaveCount(0);
  });

  test('hotspots are keyboard-activatable (Tab + Enter)', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-2');

    const hotspot = page.getByRole('button', { name: 'Slip into the alley' });
    await hotspot.focus();
    await expect(hotspot).toBeFocused();
    await page.keyboard.press('Enter');
    await expectPanel(page, 'p1-3');
  });
});

test.describe('hotspot mutations flip conditional content (visibleIf)', () => {
  test('setVariables hides the trigger hotspot and reveals the conditional one', async ({
    page,
  }) => {
    await stubManifest(page, conditionalManifest);
    await openPlayer(page);
    await expect(page.locator('.t-frame [data-layer-id="ly-pA-bg"]')).toBeVisible();

    const take = page.getByRole('button', { name: 'Take the lantern' });
    const use = page.getByRole('button', { name: 'Use the lantern' });

    // Initial variable state: hasLantern is unset.
    await expect(take).toBeVisible();
    await expect(use).toHaveCount(0);

    await take.click();

    // The mutation re-evaluates visibleIf on the overlay.
    await expect(take).toHaveCount(0);
    await expect(use).toBeVisible();

    // The revealed hotspot's goTo works.
    await use.click();
    await expect(page.locator('.t-frame [data-layer-id="ly-pB-bg"]')).toBeVisible();
  });
});
