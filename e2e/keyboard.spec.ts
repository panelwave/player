import { test, expect } from '@playwright/test';
import { openPlayer, expectPanel, toolbarContainer } from './helpers/player';

/**
 * Checklist: "Keyboard navigation".
 *
 * Shortcuts are bound on window:keydown in the player shell:
 * ArrowRight/ArrowLeft navigate, T toggles the toolbar, Escape hides it.
 */

test.describe('keyboard navigation', () => {
  test('arrow keys move through the panel graph', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-2');
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-3');
    await page.keyboard.press('ArrowLeft');
    await expectPanel(page, 'p1-2');
  });

  test('ArrowLeft on the entry panel stays put', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');
    await page.keyboard.press('ArrowLeft');
    await expectPanel(page, 'p1-1');
  });

  test('T toggles the toolbar, Escape hides it', async ({ page }) => {
    await openPlayer(page);

    // The demo starts with the toolbar visible; the floating opener only
    // renders while the toolbar is hidden.
    await expect(toolbarContainer(page)).toHaveClass(/visible/);
    await expect(page.locator('button.floating-icon')).toHaveCount(0);

    await page.keyboard.press('t');
    await expect(toolbarContainer(page)).not.toHaveClass(/visible/);
    await expect(page.locator('button.floating-icon')).toBeVisible();

    await page.keyboard.press('t');
    await expect(toolbarContainer(page)).toHaveClass(/visible/);

    await page.keyboard.press('Escape');
    await expect(toolbarContainer(page)).not.toHaveClass(/visible/);
  });

  test('arrow keys page through page view', async ({ page }) => {
    await openPlayer(page);

    // Switch panel view -> page view via the toolbar toggle.
    await page.getByRole('button', { name: 'Toggle between page and panel view' }).click();
    await expect(page.locator('.viewport-container.viewport-page')).toBeVisible();
    await expect(page.locator('.panel-container[data-panel-id="p1-1"]')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.panel-container[data-panel-id="p2-1"]')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.panel-container[data-panel-id="p1-1"]')).toBeVisible();
  });
});
