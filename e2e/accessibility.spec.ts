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

async function scanPlayer(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  name: string,
  scope = 'pw-player-shell'
) {
  const results = await new AxeBuilder({ page }).include(scope).analyze();
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

/**
 * Coverage extension (OPEN_TASKS "Player — Accessibility"): every modal and
 * overlay the toolbar can open, the paywall overlay, and the canvas view,
 * plus reduced-motion and visible-focus checks.
 */
test.describe('accessibility (axe-core) — modals, overlays, views', () => {
  const toolbarDialogs: Array<{ button: RegExp; name: string }> = [
    { button: /^open settings$/i, name: 'settings' },
    { button: /^open table of contents$/i, name: 'toc' },
    { button: /^view character roster$/i, name: 'characters' },
    { button: /^extras$/i, name: 'extras' },
    { button: /^share$/i, name: 'share' },
    { button: /^comments$/i, name: 'comments' },
  ];

  for (const d of toolbarDialogs) {
    test(`${d.name} has no serious violations and closes on Escape`, async ({ page }, testInfo) => {
      await openPlayer(page);
      await expectPanel(page, 'p1-1');
      const trigger = page.getByRole('button', { name: d.button }).first();
      await trigger.click();
      const dialog = page.locator('pw-player-shell [role="dialog"]').last();
      await expect(dialog).toBeVisible();
      // Scan the dialog itself: the panel behind the translucent backdrop is
      // covered, and its text measured against the dimmed backdrop is noise.
      await scanPlayer(page, testInfo, d.name, 'pw-player-shell [role="dialog"]');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    });
  }

  test('thumbnail strip has no serious violations', async ({ page }, testInfo) => {
    await openPlayer(page);
    await page.getByRole('button', { name: /thumbnail strip/i }).click();
    await expect(page.locator('pw-thumbnail-strip .thumbnail-strip')).toBeVisible();
    await scanPlayer(page, testInfo, 'thumbnails');
  });

  test('paywall overlay has no serious violations', async ({ page }, testInfo) => {
    await openPlayer(page, '?deny=p1-2');
    await expectPanel(page, 'p1-1');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('pw-paywall-overlay .paywall-modal')).toBeVisible();
    await scanPlayer(page, testInfo, 'paywall');
  });

  test('canvas view has no serious violations', async ({ page }, testInfo) => {
    await openPlayer(page);
    await page.getByRole('button', { name: 'Infinite Canvas' }).click();
    await expect(page.locator('.canvas-panel.current')).toBeVisible();
    await scanPlayer(page, testInfo, 'canvas');
  });
});

test.describe('motion and focus', () => {
  test('prefers-reduced-motion switches panel transitions off', async ({ page }) => {
    // Asserts the mechanism, not wall-clock time (timing is noisy under
    // parallel load): with the OS setting on, the viewport runs in
    // reduced-motion mode and a panel change renders no outgoing
    // (animated) frame at all.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPlayer(page);
    await expectPanel(page, 'p1-1');
    await expect(page.locator('pw-viewport .reduced-motion').first()).toBeAttached();

    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-2');
    await expect(page.locator('.t-frame-leave')).toHaveCount(0);
  });

  test('without the setting, panel changes animate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openPlayer(page);
    await expectPanel(page, 'p1-1');
    await expect(page.locator('pw-viewport .reduced-motion')).toHaveCount(0);
  });

  test('keyboard focus on toolbar buttons is visible', async ({ page }) => {
    await openPlayer(page);
    const button = page.getByRole('button', { name: /^open settings$/i });
    await button.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    const ring = await button.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
        shadow: cs.boxShadow !== 'none',
      };
    });
    expect(ring.outline || ring.shadow, 'focused toolbar button shows an outline or focus ring').toBeTruthy();
  });
});
