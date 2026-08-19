import { test, expect, Page } from '@playwright/test';
import { openPlayer, expectPanel, toolbarContainer } from './helpers/player';

/**
 * Checklist: "Mobile gestures". Runs only in the `mobile` project
 * (Pixel 7 emulation with touch).
 *
 * The viewport detects swipes from touchstart/touchend deltas:
 * >=50px within <=300ms at >=0.3 px/ms. Playwright's touchscreen only
 * taps, so swipes are dispatched as synthetic TouchEvents on the
 * pw-viewport host, where the touch HostListeners live.
 */

async function swipe(page: Page, dir: 'left' | 'right'): Promise<void> {
  await page.locator('pw-viewport').evaluate((el, direction) => {
    const rect = el.getBoundingClientRect();
    const cy = rect.y + rect.height / 2;
    const startX = rect.x + rect.width / 2 + (direction === 'left' ? 60 : -60);
    const endX = startX + (direction === 'left' ? -120 : 120);
    const touchAt = (x: number) =>
      new Touch({ identifier: 1, target: el, clientX: x, clientY: cy });
    el.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [touchAt(startX)],
        changedTouches: [touchAt(startX)],
        targetTouches: [touchAt(startX)],
      })
    );
    el.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        changedTouches: [touchAt(endX)],
        targetTouches: [],
      })
    );
  }, dir);
}

test.describe('mobile gestures', () => {
  test('swipe left/right navigates between panels', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    await swipe(page, 'left');
    await expectPanel(page, 'p1-2');

    await swipe(page, 'left');
    await expectPanel(page, 'p1-3');

    await swipe(page, 'right');
    await expectPanel(page, 'p1-2');
  });

  test('tapping the viewport shows the toolbar temporarily', async ({ page }) => {
    await openPlayer(page);

    // Close the initially visible toolbar first.
    await page.getByRole('button', { name: 'Close toolbar' }).tap();
    await expect(toolbarContainer(page)).not.toHaveClass(/visible/);
    await expect(page.locator('button.floating-icon')).toBeVisible();

    // A tap on the viewport shows the toolbar for ~5s, then auto-hides.
    await page.locator('.viewport-container').tap();
    await expect(toolbarContainer(page)).toHaveClass(/visible/);
    await expect(toolbarContainer(page)).not.toHaveClass(/visible/, { timeout: 7_000 });
  });
});
