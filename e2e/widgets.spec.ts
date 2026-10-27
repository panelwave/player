import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPlayer } from './helpers/player';

/**
 * Content widget layers (schema 1.10): download, audio player, video modal,
 * scroll text and iframe on the demo's "Content Widgets" work
 * (projects/demo/src/assets/widgets-manifest.json). The OpenStreetMap
 * iframe is answered by the hermetic stub (204), the media are local files.
 */

const WIDGETS = '?manifest=assets/widgets-manifest.json';
const widget = (page: Page, kind: string) => page.locator(`.t-frame [data-pw-widget="${kind}"]`);

test.describe('content widgets', () => {
  test.beforeEach(async ({ page }) => {
    await openPlayer(page, WIDGETS);
    await expect(widget(page, 'download')).toBeVisible();
  });

  test('all five widgets render on the panel', async ({ page }) => {
    for (const kind of ['download', 'audioPlayer', 'videoPlayer', 'scrollText', 'iframe']) {
      await expect(widget(page, kind)).toBeVisible();
    }
    await expect(widget(page, 'download').locator('.name')).toHaveText('Worksheet 3.pdf');
    await expect(widget(page, 'download').locator('.size')).toHaveText('699 B');
    await expect(widget(page, 'audioPlayer').locator('.time')).toHaveText('0:00 / 0:08');
  });

  test('the download card downloads the file under its display name', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      widget(page, 'download').locator('a').click(),
    ]);
    expect(download.suggestedFilename()).toBe('Worksheet 3.pdf');
    // A click inside a widget never toggles the toolbar or navigates.
    await expect(widget(page, 'download')).toBeVisible();
  });

  test('the audio player plays and seeks by clicking the waveform', async ({ page }) => {
    const player = widget(page, 'audioPlayer');
    await player.getByRole('button', { name: /Play/ }).click();
    await expect(player.getByRole('button', { name: /Pause/ })).toBeVisible();
    const audio = player.locator('audio');
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => !a.paused)).toBe(true);

    const seek = player.getByRole('slider');
    const box = (await seek.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(5);

    await player.getByRole('button', { name: /Pause/ }).click();
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  });

  test('the audio slider seeks with the keyboard without navigating', async ({ page }) => {
    const slider = widget(page, 'audioPlayer').getByRole('slider');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '5');
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  test('the video opens in a modal, Escape closes it and focus returns to the trigger', async ({ page }) => {
    const trigger = widget(page, 'videoPlayer').getByRole('button', { name: /Watch video/ });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Lecture: meanders in 5 minutes' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('video')).toHaveAttribute('src', /video-demo-b\.mp4$/);
    await expect(dialog.getByRole('slider')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('pw-video-modal')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('the video modal closes from its close button and the backdrop', async ({ page }) => {
    const trigger = widget(page, 'videoPlayer').getByRole('button', { name: /Watch video/ });
    await trigger.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('pw-video-modal')).toHaveCount(0);

    await trigger.click();
    await page.locator('.video-modal-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('pw-video-modal')).toHaveCount(0);
  });

  test('the scroll box scrolls with the wheel; its link opens a new tab', async ({ page, context }) => {
    const box = widget(page, 'scrollText').locator('.scroller');
    await expect(box.locator('h2')).toHaveText('Meanders');
    await box.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      box.getByRole('link', { name: 'Wikipedia' }).click(),
    ]);
    expect(popup.url()).toContain('wikipedia.org');
    await popup.close();
  });

  test('the iframe is sandboxed, titled and offers an open-in-new-tab link', async ({ page }) => {
    const frame = widget(page, 'iframe').locator('iframe');
    await expect(frame).toHaveAttribute('title', 'Map of the Isar');
    await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);
    await expect(frame).toHaveAttribute('allow', 'fullscreen');
    await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    await expect(widget(page, 'iframe').getByRole('link', { name: /Open in new tab/ })).toHaveAttribute('target', '_blank');
  });

  test('the theme reaches the widgets', async ({ page }) => {
    const accent = await widget(page, 'download')
      .locator('.action')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(accent).toBe('rgb(14, 116, 144)');
  });

  test('widgets pass axe', async ({ page }) => {
    // The embedded third-party page is not ours to audit.
    const results = await new AxeBuilder({ page })
      .include('.t-frame [data-pw-widget]')
      .exclude('.t-frame [data-pw-widget="iframe"] iframe')
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('German texts follow the locale', async ({ page }) => {
    await page.getByRole('button', { name: 'Select language' }).click();
    await page.locator('.language-item', { hasText: 'de-DE' }).click();
    await expect(widget(page, 'download').locator('.name')).toHaveText('Arbeitsblatt 3.pdf');
    await expect(widget(page, 'scrollText').locator('h2')).toHaveText('Mäander');
  });

});

test.describe('content widgets in page view', () => {
  test('render on the page and mount the iframe once it is on screen', async ({ page }) => {
    await openPlayer(page, WIDGETS, { view: 'default' });
    const pageView = page.locator('pw-player-shell');
    for (const kind of ['download', 'audioPlayer', 'videoPlayer', 'scrollText', 'iframe']) {
      await expect(pageView.locator(`[data-pw-widget="${kind}"]`).first()).toBeVisible();
    }
    await expect(pageView.locator('[data-pw-widget="iframe"] iframe').first()).toHaveAttribute('sandbox', /allow-scripts/);
    // The modal opens from page view too.
    await pageView.locator('[data-pw-widget="videoPlayer"] button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('pw-video-modal')).toHaveCount(0);
  });
});
