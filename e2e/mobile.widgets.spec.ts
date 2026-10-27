import { test, expect } from '@playwright/test';
import { openPlayer } from './helpers/player';

/**
 * Content widgets on a phone (Pixel 7 emulation, `mobile` project). A touch
 * gesture inside a widget belongs to the widget: the viewport's touchmove
 * handler (which calls preventDefault for panning) must never see it, so the
 * scroll box scrolls natively and no swipe navigates.
 */

const WIDGETS = '?manifest=assets/widgets-manifest.json';

test.describe('content widgets on mobile', () => {
  test.beforeEach(async ({ page }) => {
    await openPlayer(page, WIDGETS);
    await expect(page.locator('.t-frame [data-pw-widget="scrollText"]')).toBeVisible();
  });

  test('a touch drag inside the scroll box is not cancelled by the viewport', async ({ page }) => {
    const prevented = await page.locator('.t-frame [data-pw-widget="scrollText"] .scroller').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const touch = (y: number) => new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
      const start = new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch(rect.y + 120)], changedTouches: [touch(rect.y + 120)], targetTouches: [touch(rect.y + 120)] });
      const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(rect.y + 40)], changedTouches: [touch(rect.y + 40)], targetTouches: [touch(rect.y + 40)] });
      const end = new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [touch(rect.y + 40)], targetTouches: [] });
      el.dispatchEvent(start);
      el.dispatchEvent(move);
      el.dispatchEvent(end);
      return start.defaultPrevented || move.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });

  test('tapping the audio play button plays it; the panel stays', async ({ page }) => {
    const player = page.locator('.t-frame [data-pw-widget="audioPlayer"]');
    await player.getByRole('button', { name: /Play/ }).tap();
    await expect(player.getByRole('button', { name: /Pause/ })).toBeVisible();
    await expect(page.locator('.t-frame [data-layer-id="ly-bg"]')).toBeVisible();
  });

  test('the video modal fits the phone screen', async ({ page }) => {
    await page.locator('.t-frame [data-pw-widget="videoPlayer"] button').tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
    await dialog.getByRole('button', { name: 'Close' }).tap();
    await expect(page.locator('pw-video-modal')).toHaveCount(0);
  });
});
