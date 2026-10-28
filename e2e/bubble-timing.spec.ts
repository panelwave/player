import { test, expect, type Page } from '@playwright/test';
import { openPlayer, expectPanel, stubManifest } from './helpers/player';
import { bubbleTimingManifest } from './fixtures/bubble-timing-manifest';

/**
 * Timed speech balloons (schema 1.10 `SpeechBubble.showAtMs`): a later
 * balloon waits on its panel's clock — the panel being shown, or on a video
 * panel the video starting to play — and then fades in.
 *
 * The video case does not rely on the browser decoding the clip (the
 * Playwright Chromium build may lack the codec): it fires the media element's
 * own `playing` event, which is what the clock listens to.
 */
const balloon = (page: Page, id: string) => page.locator(`.t-frame .speech-bubble-wrapper[data-bubble-id="${id}"]`);

test.describe('timed speech balloons', () => {
  test.beforeEach(async ({ page }) => {
    await stubManifest(page, bubbleTimingManifest);
  });

  test('a later balloon appears at its time on an image panel and stays', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'pTalk');

    await expect(balloon(page, 'b-now')).toBeVisible();
    await expect(balloon(page, 'b-later')).toHaveCount(1); // laid out …
    await expect(balloon(page, 'b-later')).toBeHidden(); // … but waiting
    await expect(balloon(page, 'b-later')).toHaveAttribute('aria-hidden', 'true');

    await expect(balloon(page, 'b-later')).toBeVisible({ timeout: 5000 });
    await expect(balloon(page, 'b-later')).not.toHaveAttribute('aria-hidden', 'true');

    // A re-render (resize re-measures every balloon) keeps it shown.
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width - 120, height: size.height - 60 });
    await page.waitForTimeout(300);
    await expect(balloon(page, 'b-later')).toBeVisible();
    await expect(balloon(page, 'b-now')).toBeVisible();
  });

  test('on a video panel the clock waits for the video to play', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'pTalk');
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'pClip');

    await expect(balloon(page, 'b-clip-now')).toBeVisible();
    // Longer than its 0.8 s, but the on-click video has not started.
    await page.waitForTimeout(1500);
    await expect(balloon(page, 'b-clip')).toBeHidden();

    await page.locator('.t-frame pw-video-layer video').evaluate((video) => {
      Object.defineProperty(video, 'paused', { configurable: true, get: () => false });
      video.dispatchEvent(new Event('playing'));
    });
    await expect(balloon(page, 'b-clip')).toBeVisible({ timeout: 5000 });
  });

  test('going back to a panel restarts its dialogue', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'pTalk');
    await expect(balloon(page, 'b-later')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'pClip');
    await page.keyboard.press('ArrowLeft');
    await expectPanel(page, 'pTalk');

    await expect(balloon(page, 'b-later')).toBeHidden();
    await expect(balloon(page, 'b-later')).toBeVisible({ timeout: 5000 });
  });

  test('reduced motion shows every balloon at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPlayer(page);
    await expectPanel(page, 'pTalk');
    await expect(balloon(page, 'b-now')).toBeVisible();
    await expect(balloon(page, 'b-later')).toBeVisible();
  });

  test('print renders show every balloon at once', async ({ page }) => {
    await page.addInitScript(() => document.documentElement.classList.add('pw-print'));
    await openPlayer(page);
    await expectPanel(page, 'pTalk');
    await expect(balloon(page, 'b-now')).toBeVisible();
    await expect(balloon(page, 'b-later')).toBeVisible();
  });
});
