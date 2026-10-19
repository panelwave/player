import { test, expect, type Page } from '@playwright/test';
import { openPlayer, dismissCover } from './helpers/player';

/**
 * Mouse handling on the infinite-canvas stage: the camera pans only while
 * the button is held, a plain hover never moves it, and a single click
 * navigates. Until 2026-10-19 the stage captured the pointer on its host
 * while listening on an inner element, so the release was lost: every
 * later hover dragged the canvas and clicks never navigated.
 */

const currentPanel = (page: Page) => page.locator('.canvas-panel.current');
const world = (page: Page) => page.locator('.canvas-world');
const stage = (page: Page) => page.locator('.canvas-viewport');

async function openCanvasDemo(page: Page): Promise<void> {
  await openPlayer(page);
  await page.getByRole('button', { name: 'Infinite Canvas' }).click();
  await dismissCover(page, true);
  await expect(currentPanel(page)).toHaveAttribute('data-panel-id', 'p-top');
  await settled(page);
}

/** Waits until the camera stops moving and returns its transform. */
async function settled(page: Page): Promise<string> {
  let previous = '';
  for (let i = 0; i < 40; i++) {
    const now = (await world(page).getAttribute('style')) ?? '';
    if (now === previous) return now;
    previous = now;
    await page.waitForTimeout(150);
  }
  return previous;
}

async function stageBox(page: Page) {
  const box = await stage(page).boundingBox();
  if (!box) throw new Error('no canvas stage');
  return box;
}

test.describe('canvas view mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse behaviour');

  test('hovering never pans the canvas, also after a click', async ({ page }) => {
    await openCanvasDemo(page);
    const box = await stageBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.click(cx, cy);
    await expect(currentPanel(page)).toHaveAttribute('data-panel-id', 'p-fall', { timeout: 10_000 });
    const before = await settled(page);

    await page.mouse.move(cx + 200, cy + 120, { steps: 10 });
    await page.mouse.move(cx - 150, cy - 80, { steps: 10 });
    expect(await settled(page)).toBe(before);
  });

  test('the stage shows an arrow cursor, not a grab hand', async ({ page }) => {
    await openCanvasDemo(page);
    expect(await stage(page).evaluate((el) => getComputedStyle(el).cursor)).not.toMatch(/grab/);
  });

  test('dragging with the button held pans without navigating', async ({ page }) => {
    await openCanvasDemo(page);
    const before = await settled(page);
    const box = await stageBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 180, cy - 140, { steps: 12 });
    await page.mouse.up();

    expect(await settled(page)).not.toBe(before);
    await expect(currentPanel(page)).toHaveAttribute('data-panel-id', 'p-top');

    // Released: further hovering leaves the camera alone.
    const afterDrag = await settled(page);
    await page.mouse.move(cx + 100, cy + 100, { steps: 8 });
    expect(await settled(page)).toBe(afterDrag);
  });

  test('a single click advances to the next panel; the left edge goes back', async ({ page }) => {
    await openCanvasDemo(page);
    const box = await stageBox(page);

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(currentPanel(page)).toHaveAttribute('data-panel-id', 'p-fall', { timeout: 10_000 });
    await settled(page);

    await page.mouse.click(box.x + box.width * 0.05, box.y + box.height / 2);
    await expect(currentPanel(page)).toHaveAttribute('data-panel-id', 'p-top', { timeout: 10_000 });
  });
});
