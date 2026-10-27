import { test, expect } from '@playwright/test';
import { openPlayer, expectPanel, stubManifest } from './helpers/player';
import { chaptersManifest, C2_UUID } from './fixtures/chapters-manifest';

/**
 * Chapter embeds (docs/MULTI_CHAPTER_EMBED.md, P1): the demo's `?chapter=`
 * sets the shell's `chapterScope`. Reading stays inside that chapter: next
 * stops at its end, back stops at its start, a hotspot into another chapter
 * is inert and the table of contents lists only the scoped chapter.
 */

const next = (page: import('@playwright/test').Page) => page.keyboard.press('ArrowRight');
const previous = (page: import('@playwright/test').Page) => page.keyboard.press('ArrowLeft');

test.describe('chapter scope', () => {
  test.beforeEach(async ({ page }) => {
    await stubManifest(page, chaptersManifest);
  });

  test('starts at the scoped chapter and stops at both of its ends', async ({ page }) => {
    await openPlayer(page, '?chapter=c2');
    await expectPanel(page, 'b1');

    await previous(page);
    await page.waitForTimeout(500);
    await expectPanel(page, 'b1');

    await next(page);
    await expectPanel(page, 'b2');
    await next(page);
    await expectPanel(page, 'b3');

    // The work goes on with c3 — the chapter embed does not.
    await next(page);
    await page.waitForTimeout(800);
    await expectPanel(page, 'b3');
    await expect(page.locator('.t-frame [data-layer-id="ly-c3-1-bg"]')).toHaveCount(0);
  });

  test('accepts the CMS chapter uuid', async ({ page }) => {
    await openPlayer(page, `?chapter=${C2_UUID}`);
    await expectPanel(page, 'b1');
  });

  test('a hotspot into another chapter is inert', async ({ page }) => {
    await openPlayer(page, '?chapter=c2');
    await next(page);
    await expectPanel(page, 'b2');
    await page.getByRole('button', { name: 'Skip ahead' }).click();
    await page.waitForTimeout(800);
    await expectPanel(page, 'b2');
  });

  test('without a scope the same hotspot crosses chapters', async ({ page }) => {
    await openPlayer(page, `?panel=b2`);
    await expectPanel(page, 'b2');
    await page.getByRole('button', { name: 'Skip ahead' }).click();
    await expectPanel(page, 'c3-1');
  });

  test('the table of contents lists only the scoped chapter', async ({ page }) => {
    await openPlayer(page, '?chapter=c2');
    await page.getByRole('button', { name: /^open table of contents$/i }).click();
    const toc = page.getByRole('dialog', { name: 'Table of Contents' });
    await expect(toc).toBeVisible();
    await expect(toc.getByText('Chapter Two')).toBeVisible();
    await expect(toc.getByText('Chapter One')).toHaveCount(0);
    await expect(toc.getByText('Chapter Three')).toHaveCount(0);
  });
});
