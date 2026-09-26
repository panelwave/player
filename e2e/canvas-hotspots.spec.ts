import { test, expect, type Page } from '@playwright/test';
import { openPlayer } from './helpers/player';

/**
 * Hotspots in the infinite-canvas view.
 *
 * The canvas demo's fork panel (p-mid) carries a "Pick up the lantern"
 * hotspot that sets `hasLantern`; from p-mid the path continues to p-deep
 * without the lantern and to p-secret with it. Until 2026-09-26 canvas
 * hotspots were render-only (a tap fell through to panel / edge navigation).
 */

const currentPanel = (page: Page) => page.locator('.canvas-panel.current');

async function openCanvasDemo(page: Page): Promise<void> {
  await openPlayer(page);
  await page.getByRole('button', { name: 'Infinite Canvas' }).click();
  await expect(currentPanel(page)).toHaveAttribute('data-panel-id', 'p-top');
}

async function stepTo(page: Page, panelId: string): Promise<void> {
  await page.keyboard.press('ArrowRight');
  await expect(currentPanel(page)).toHaveAttribute('data-panel-id', panelId, { timeout: 10_000 });
}

async function goToFork(page: Page): Promise<void> {
  await openCanvasDemo(page);
  await stepTo(page, 'p-fall');
  await stepTo(page, 'p-mid');
}

test.describe('canvas view hotspots', () => {
  test("the current panel's hotspot is clickable and its action runs", async ({ page }) => {
    await goToFork(page);

    const lantern = currentPanel(page).getByRole('button', { name: 'Pick up the lantern' });
    await expect(lantern).toBeVisible();
    await lantern.click();

    // The click stayed on the hotspot (no panel/edge navigation)...
    await expect(currentPanel(page)).toHaveAttribute('data-panel-id', 'p-mid');
    // ...and its setVariables action took effect: the fork now leads to p-secret.
    await stepTo(page, 'p-secret');
  });

  test('without the lantern the fork leads to p-deep', async ({ page }) => {
    await goToFork(page);
    await stepTo(page, 'p-deep');
  });

  test('hotspots on a visited, non-current panel are render-only', async ({ page }) => {
    await goToFork(page);
    await stepTo(page, 'p-deep');
    const visited = page.locator('.canvas-panel[data-panel-id="p-mid"]');
    await expect(visited.locator('.hotspots-svg')).toHaveClass(/non-interactive/);
    await expect(visited.getByRole('button', { name: 'Pick up the lantern' })).toHaveCount(0);
  });

  test('the hotspot is keyboard-activatable in canvas view', async ({ page }) => {
    await goToFork(page);
    const lantern = currentPanel(page).getByRole('button', { name: 'Pick up the lantern' });
    await lantern.focus();
    await page.keyboard.press('Enter');
    await expect(currentPanel(page)).toHaveAttribute('data-panel-id', 'p-mid');
    await lantern.blur();
    await stepTo(page, 'p-secret');
  });
});
