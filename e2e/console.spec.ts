import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import { openPlayer, expectPanel, dismissCover } from './helpers/player';

/**
 * Checklist (Final Verification): "No console errors or warnings".
 *
 * Walks the reader through the main surfaces (panel → page → canvas view,
 * navigation across a page boundary, every toolbar modal) and fails on any
 * console error/warning or uncaught page error. Angular's dev-mode banner
 * and the Playwright-stubbed network are the only allowed noise.
 */

const ALLOWED = [
  /Angular is running in development mode/i,
];

function collect(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (ALLOWED.some((re) => re.test(text))) return;
    problems.push(`${msg.type()}: ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function openAndClose(page: Page, buttonName: string): Promise<void> {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('console hygiene', () => {
  test('reading through panel, page and canvas view logs no errors or warnings', async ({ page }) => {
    const problems = collect(page);
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    for (const panel of ['p1-2', 'p1-3', 'p1-4', 'p1-5', 'p2-1']) {
      await page.keyboard.press('ArrowRight');
      await expectPanel(page, panel);
    }

    await page.getByRole('button', { name: 'Toggle between page and panel view', exact: true }).click();
    await expect(page.locator('.viewport-container.viewport-page')).toBeVisible();
    await page.getByRole('button', { name: 'Toggle between page and panel view', exact: true }).click();
    await expect(page.locator('.viewport-container.viewport-panel')).toBeVisible();

    await page.getByRole('button', { name: 'Infinite Canvas' }).click();
    await dismissCover(page, true);
    await expect(page.locator('.canvas-panel.current')).toBeVisible();

    expect(problems).toEqual([]);
  });

  test('opening and closing every toolbar modal logs no errors or warnings', async ({ page }) => {
    const problems = collect(page);
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    await openAndClose(page, 'Open table of contents');
    await openAndClose(page, 'Open settings');
    await openAndClose(page, 'Select language');
    await openAndClose(page, 'View character roster');

    expect(problems).toEqual([]);
  });
});
