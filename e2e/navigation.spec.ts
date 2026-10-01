import { test, expect } from '@playwright/test';
import { openPlayer, expectPanel, currentPanelLayer, dismissCover } from './helpers/player';

/**
 * Checklist: "Load and navigate sample manifest".
 *
 * The demo app loads assets/sample-manifest.json (City Noir, 1 chapter,
 * 3 pages, 15 panels, linear graph) and starts in panel view on the
 * entry panel p1-1.
 */

test.describe('load and navigate the sample manifest', () => {
  test('loads the manifest and shows the entry panel', async ({ page }) => {
    await openPlayer(page);

    // Panel view is the initial mode for the sample manifest.
    await expect(page.locator('.viewport-container.viewport-panel')).toBeVisible();
    await expectPanel(page, 'p1-1');

    // The demo chrome is up too.
    await expect(page.getByRole('button', { name: 'Sample Comic' })).toBeVisible();
  });

  test('navigates forward and backward with the hover nav arrows', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    // The arrows only render while the pointer hovers the edge zones.
    const viewport = page.locator('.viewport-container.viewport-panel');
    const box = (await viewport.boundingBox())!;

    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
    await page.getByRole('button', { name: 'Next panel' }).click();
    await expectPanel(page, 'p1-2');

    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.getByRole('button', { name: 'Previous panel' }).click();
    await expectPanel(page, 'p1-1');
  });

  test('navigates across the page boundary (p1-5 -> p2-1)', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    for (const panel of ['p1-2', 'p1-3', 'p1-4', 'p1-5', 'p2-1']) {
      await page.keyboard.press('ArrowRight');
      await expectPanel(page, panel);
    }
    // Old panel is gone once the transition frame settles.
    await expect(currentPanelLayer(page, 'p1-5')).toHaveCount(0);
  });

  test('switches between demo manifests', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    await page.getByRole('button', { name: 'Infinite Canvas' }).click();
    await dismissCover(page, true);
    // The canvas manifest opens in canvas view: panels carry data-panel-id
    // and the current one is marked.
    await expect(page.locator('.canvas-panel.current')).toBeVisible();

    await page.getByRole('button', { name: 'Sample Comic' }).click();
    await dismissCover(page, true);
    await expectPanel(page, 'p1-1');
  });
});
