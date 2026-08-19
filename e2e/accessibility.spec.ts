import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPlayer, expectPanel } from './helpers/player';

/**
 * Checklist (Accessibility): "Run axe-core in E2E tests".
 *
 * Scans are scoped to the player shell so demo-chrome issues don't mask
 * player regressions. Serious/critical violations fail the test; the
 * full violation list is attached to the report for triage.
 */

async function scanPlayer(page: import('@playwright/test').Page, testInfo: import('@playwright/test').TestInfo, name: string) {
  const results = await new AxeBuilder({ page }).include('pw-player-shell').analyze();
  await testInfo.attach(`axe-${name}`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')
  ).toEqual([]);
}

test.describe('accessibility (axe-core)', () => {
  test('panel view with toolbar has no serious violations', async ({ page }, testInfo) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');
    await scanPlayer(page, testInfo, 'panel-view');
  });

  test('page view has no serious violations', async ({ page }, testInfo) => {
    await openPlayer(page);
    await page.getByRole('button', { name: 'Toggle between page and panel view' }).click();
    await expect(page.locator('.viewport-container.viewport-page')).toBeVisible();
    await scanPlayer(page, testInfo, 'page-view');
  });

  test('language modal has no serious violations', async ({ page }, testInfo) => {
    await openPlayer(page);
    await page.getByRole('button', { name: 'Select language' }).click();
    await expect(page.locator('.language-container[role="dialog"]')).toBeVisible();
    await scanPlayer(page, testInfo, 'language-modal');
  });
});
