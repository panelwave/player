import { test, expect } from '@playwright/test';
import { openPlayer, expectPanel } from './helpers/player';

/**
 * Checklist: "Paywall blocks content".
 *
 * What the player implements today: an optional entitlement adapter on
 * the shell; navigating to a panel the adapter denies aborts the
 * navigation and puts the shell into its error state. The dedicated
 * pw-paywall-overlay (purchase CTA) is not mounted by the shell yet and
 * manifest.paywall rules are not evaluated — both tracked as open gaps
 * in docs/technical/OPEN_TASKS.md. These tests cover the implemented
 * blocking path via the demo app's `?deny=<panelId>` hook.
 */

test.describe('entitlement gating', () => {
  test('navigation to a denied panel is blocked with an error state', async ({ page }) => {
    await openPlayer(page, '?deny=p1-2');
    await expectPanel(page, 'p1-1');

    await page.keyboard.press('ArrowRight');

    const error = page.locator('pw-player-shell .error-container');
    await expect(error).toBeVisible();
    await expect(error.locator('.error-message')).toContainText('Access denied to panel: p1-2');
    await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
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
