import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { openPlayer, expectPanel, stubExternalImages, dismissCover } from './helpers/player';

/**
 * Demo app tooling (OPEN_TASKS "Player — Demo app"): manifest selector
 * (bundled demos, URL, local file), responsive preview frames and the
 * dev-tools drawer (variables, event log, performance, debug overlay).
 * These cover the demo chrome only; the player itself is exercised by the
 * other specs.
 */
test.describe('demo app tooling', () => {
  test('dev tools log panel changes and show live metrics', async ({ page }) => {
    await openPlayer(page, '?devtools=1');
    const tools = page.getByRole('complementary', { name: 'Developer tools' });
    await expect(tools).toBeVisible();

    await expectPanel(page, 'p1-1');
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'p1-2');

    await tools.getByRole('tab', { name: 'Events' }).click();
    await expect(tools.locator('.events')).toContainText('panelChange');
    // The payload carries the panel id and the one before it.
    await expect(tools.locator('.events')).toContainText('"panel":"p1-2","previous":"p1-1"');
    // One navigation, one panelChange (the shell used to emit it twice).
    await expect(tools.locator('.events li', { hasText: '"panel":"p1-2"' })).toHaveCount(1);

    await tools.getByRole('tab', { name: 'Performance' }).click();
    await expect(tools.locator('[data-metric="load"]')).toContainText('ms');
    await expect.poll(async () => Number(await tools.locator('[data-metric="fps"]').textContent())).toBeGreaterThan(0);
    await expect(tools.locator('[data-metric="panels"]')).not.toHaveText('0');

    await tools.getByRole('tab', { name: 'Variables' }).click();
    for (const scope of ['global', 'chapter', 'page', 'session', 'persistent']) {
      await expect(tools.getByRole('heading', { name: scope })).toBeVisible();
    }
  });

  test('the dev tools toggle opens and closes the drawer', async ({ page }) => {
    await openPlayer(page);
    const tools = page.getByRole('complementary', { name: 'Developer tools' });
    await expect(tools).toHaveCount(0);
    await page.getByRole('button', { name: 'Dev tools' }).click();
    await expect(tools).toBeVisible();
    await page.getByRole('button', { name: 'Dev tools' }).click();
    await expect(tools).toHaveCount(0);
  });

  test('debug overlay outlines the rendered layers', async ({ page }) => {
    await openPlayer(page, '?devtools=1');
    const layer = page.locator('.t-frame [data-layer-id]').first();
    await expect(layer).toBeVisible();
    expect(await layer.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');

    await page.getByRole('checkbox', { name: 'Debug overlay' }).check();
    await expect.poll(() => layer.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');
  });

  test('responsive preview frames the player at the device size', async ({ page }) => {
    await openPlayer(page);
    await page.getByLabel('Preview size').selectOption('phone');
    const frame = page.locator('.device-frame');
    await expect.poll(async () => (await frame.boundingBox())?.width).toBe(390);
    await expect(page.locator('pw-player-shell .player-content')).toBeVisible();
    await expect(page.getByLabel('Preview size')).toHaveValue('phone');
    // The player's fixed toolbar stays inside the device frame.
    const box = (await frame.boundingBox())!;
    const bar = (await page.locator('.toolbar-container').boundingBox())!;
    expect(bar.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(bar.x + bar.width).toBeLessThanOrEqual(box.x + box.width + 1);

    await page.getByLabel('Preview size').selectOption('fill');
    await expect.poll(async () => (await frame.boundingBox())?.width ?? 0).toBeGreaterThan(390);
  });

  test('a manifest can be loaded from a URL', async ({ page }) => {
    await openPlayer(page);
    await page.getByLabel('Manifest URL').fill('assets/canvas-manifest.json');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await dismissCover(page, true);
    await expect(page.locator('.canvas-panel.current')).toBeVisible();
  });

  test('a manifest can be opened from a local file', async ({ page }) => {
    await stubExternalImages(page);
    await page.goto('/?device=fill');
    await expect(page.locator('pw-player-shell .player-content')).toBeVisible({ timeout: 30_000 });

    const json = readFileSync(join(__dirname, '..', 'projects', 'demo', 'src', 'assets', 'canvas-manifest.json'));
    await page.getByLabel('Open manifest file').setInputFiles({ name: 'my-work.json', mimeType: 'application/json', buffer: json });
    await dismissCover(page, true);
    await expect(page.locator('.canvas-panel.current')).toBeVisible();
  });

  test('an invalid manifest file shows an error instead of crashing', async ({ page }) => {
    await openPlayer(page);
    await page.getByLabel('Open manifest file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ nope') });
    await expect(page.getByRole('alert')).toContainText('broken.json is not valid JSON');
  });
});
