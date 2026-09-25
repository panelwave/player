import { test, expect } from '@playwright/test';
import { openPlayer, expectPanel } from './helpers/player';

/**
 * Checklist: "Paywall blocks content".
 *
 * A host-supplied entitlement adapter still wins over the manifest's
 * paywall rules; when it denies a panel the navigation stops, the reader
 * stays on the last permitted panel and the shell raises pw-paywall-overlay
 * (no error state — a paywall is not a failure). These tests cover that
 * blocking path via the demo app's `?deny=<panelId>` hook.
 */

test.describe('entitlement gating', () => {
  test('navigation to a denied panel raises the paywall and stays put', async ({ page }) => {
    await openPlayer(page, '?deny=p1-2');
    await expectPanel(page, 'p1-1');

    await page.keyboard.press('ArrowRight');

    const overlay = page.locator('pw-paywall-overlay .paywall-modal');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('.paywall-message')).toContainText('requires an entitlement');
    await expect(page.locator('pw-player-shell .error-container')).toHaveCount(0);

    // The reader is still on the last panel they were allowed to see.
    await expectPanel(page, 'p1-1');

    // Escape dismisses the overlay without granting access.
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    await expectPanel(page, 'p1-1');
  });

  test('panels the adapter allows stay reachable', async ({ page }) => {
    await openPlayer(page, '?deny=p1-3');
    await expectPanel(page, 'p1-1');

    // p1-2 is allowed…
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-2');
    await expect(page.locator('.error-container')).toHaveCount(0);

    // …and going back works too.
    await page.keyboard.press('ArrowLeft');
    await expectPanel(page, 'p1-1');
  });

  test('without an adapter nothing is gated', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-3');
    await expect(page.locator('.error-container')).toHaveCount(0);
  });
});
