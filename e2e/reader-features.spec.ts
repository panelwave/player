import { test, expect, Page } from '@playwright/test';
import { openPlayer, expectPanel } from './helpers/player';

/**
 * Reader features: the cover before the first panel, the PanelWave icon
 * that opens the toolbar, thumbnails with artwork, chapter separators and
 * the cover tile, and page view following a thumbnail to the panel's page.
 */

const toolbarButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.describe('reader features', () => {
  test('reading starts on the cover; next leaves it, previous returns to it', async ({ page }) => {
    await openPlayer(page, '', { keepCover: true });
    const cover = page.locator('pw-player-shell .pw-cover');
    await expect(cover).toBeVisible();
    await expect(cover.locator('img')).toHaveAttribute('src', /.+/);

    await page.keyboard.press('ArrowRight');
    await expect(cover).toHaveCount(0);
    await expectPanel(page, 'p1-1');

    await page.keyboard.press('ArrowLeft');
    await expect(cover).toBeVisible();
  });

  test('by default the cover comes first, then page view', async ({ page }) => {
    await openPlayer(page, '', { keepCover: true, view: 'default' });
    const cover = page.locator('pw-player-shell .pw-cover');
    await expect(cover).toBeVisible();
    await cover.click();
    await expect(cover).toHaveCount(0);
    await expect(page.locator('.page-stage .pt-frame [data-panel-id="p1-1"]')).toBeVisible();
  });

  test('the share dialog offers the link of the current page and draws its QR code', async ({ page }) => {
    await openPlayer(page, '', { view: 'default' });
    await toolbarButton(page, 'Share').click();
    const link = page.locator('pw-share-modal .link-input');
    await expect(link).toHaveValue(/[?&]page=pg-1(&|$)/);
    await page.getByRole('button', { name: /Show QR Code/i }).click();
    const qr = page.locator('pw-share-modal svg.qr-code-image');
    await expect(qr).toBeVisible();
    await expect(qr.locator('path')).toHaveAttribute('d', /^M\d+ \d+h1v1h-1z/);
    await expect(page.locator('pw-share-modal img')).toHaveCount(0);
  });

  test('pages and panels have their own URLs; a shared link opens there', async ({ page }) => {
    await openPlayer(page, '?page=pg-2', { view: 'default' });
    await expect(page.locator('.page-stage .pt-frame [data-panel-id="p2-1"]')).toBeVisible();
    await expect(page).toHaveURL(/[?&]page=pg-2(&|$)/);

    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/[?&]page=pg-3(&|$)/);

    await toolbarButton(page, 'Toggle between page and panel view').click();
    await expect(page).toHaveURL(/[?&]panel=p3-1(&|$)/);

    await openPlayer(page, '?panel=p1-3', { view: 'default' });
    await expectPanel(page, 'p1-3');
  });

  test('the PanelWave icon opens the toolbar', async ({ page }) => {
    await openPlayer(page);
    // The demo starts with the toolbar shown; the icon replaces it when hidden.
    await page.keyboard.press('Escape');
    const icon = page.locator('.floating-icon');
    await expect(icon.locator('img')).toHaveAttribute('src', /^data:image\/webp;base64,/);
    await icon.click();
    await expect(page.locator('.toolbar-container')).toHaveClass(/visible/);
  });

  test('the thumbnail strip shows artwork, the cover tile and chapter separators', async ({ page }) => {
    await openPlayer(page);
    await toolbarButton(page, 'Show/hide thumbnail strip').click();
    const strip = page.locator('.thumbnail-strip');
    await expect(strip.locator('.thumbnail-item.cover-item')).toHaveCount(1);
    expect(await strip.locator('.chapter-separator').count()).toBeGreaterThan(0);
    expect(await strip.locator('img.thumbnail-image').count()).toBeGreaterThan(3);

    await strip.locator('.thumbnail-item.cover-item').click();
    await expect(page.locator('pw-player-shell .pw-cover')).toBeVisible();
  });

  test('in page view a thumbnail opens the page that shows the panel', async ({ page }) => {
    await openPlayer(page);
    await toolbarButton(page, 'Toggle between page and panel view').click();
    const canvas = page.locator('.page-stage .pt-frame .page-canvas');
    await expect(canvas.locator('[data-panel-id="p1-1"]')).toBeVisible();

    await toolbarButton(page, 'Show/hide thumbnail strip').click();
    await page.getByRole('button', { name: 'Panel p2-1' }).click();
    await expect(canvas.locator('[data-panel-id="p2-1"]')).toBeVisible();
    await expect(canvas.locator('[data-panel-id="p1-1"]')).toHaveCount(0);
  });
});
