import { test, expect, type Locator, type Page } from '@playwright/test';
import { openPlayer, expectPanel, stubManifest } from './helpers/player';
import { animationsManifest } from './fixtures/animations-manifest';

/**
 * Panel animations (schema `PanelAnimations`): layer keyframes and camera
 * moves, rendered by `PanelAnimationDirective`.
 *
 * The fixture's animations run 600 ms. Assertions target the end state
 * (polled), so the tests do not depend on frame timing.
 */

/** Computed transform of an element as { scale, x, y } (identity when `none`). */
async function matrixOf(locator: Locator): Promise<{ scale: number; x: number; y: number }> {
  return locator.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return { scale: 1, x: 0, y: 0 };
    const m = new DOMMatrixReadOnly(t);
    return { scale: m.a, x: m.e, y: m.f };
  });
}

const computed = (locator: Locator, prop: string): Promise<string> =>
  locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

const panelBox = (page: Page) => page.locator('.t-frame .panel-container');
const camera = (page: Page) => page.locator('.t-frame .panel-container > .pw-panel-camera');
const layer = (page: Page, id: string) => page.locator(`.t-frame [data-layer-id="${id}"]`);

test.describe('panel animations', () => {
  test.beforeEach(async ({ page }) => {
    await stubManifest(page, animationsManifest);
  });

  test('layer keyframes play to their end state and stay inside the panel box', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'pSlide');

    // The panel box clips the layer that slides in from outside.
    expect(await computed(panelBox(page), 'overflow')).toBe('hidden');

    // End state: hero at its resting position, caption fully visible.
    await expect.poll(() => computed(layer(page, 'ly-caption'), 'opacity')).toBe('1');
    await expect.poll(() => computed(layer(page, 'ly-hero'), 'translate')).toMatch(/^(none|0px( 0px)?)$/);

    // The hero's own opacity was never animated and is still the layer's.
    expect(await computed(layer(page, 'ly-hero'), 'opacity')).toBe('0.8');

    // The hero ends where the panel is (it started a full panel width to the left).
    const box = (await panelBox(page).boundingBox())!;
    const hero = (await layer(page, 'ly-hero').boundingBox())!;
    expect(Math.abs(hero.x - box.x)).toBeLessThan(2);
  });

  test('a camera move zooms the artwork into the end rect', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'pCamera');

    expect(await computed(panelBox(page), 'overflow')).toBe('hidden');

    // End rect = bottom-right quarter: scale 2, shifted by one panel size.
    await expect.poll(async () => (await matrixOf(camera(page))).scale).toBeCloseTo(2, 3);
    const size = await panelBox(page).evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
    const m = await matrixOf(camera(page));
    expect(m.x).toBeCloseTo(-size.w, 0);
    expect(m.y).toBeCloseTo(-size.h, 0);

    // The artwork now covers twice the panel box; the box itself did not grow.
    const box = (await panelBox(page).boundingBox())!;
    const art = (await layer(page, 'ly-pCamera-bg').boundingBox())!;
    expect(art.width / box.width).toBeCloseTo(2, 1);
  });

  test('keyframes and a camera move share one timeline; hotspots move with the camera', async ({ page }) => {
    await openPlayer(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'pBoth');

    await expect.poll(async () => (await matrixOf(camera(page))).scale).toBeCloseTo(2, 3);
    await expect.poll(() => computed(layer(page, 'ly-pBoth-bg'), 'filter')).toBe('saturate(1)');

    // Top-left quarter: no shift, and the hotspot (a quarter of the panel wide)
    // now spans half the panel box.
    const m = await matrixOf(camera(page));
    expect(m.x).toBeCloseTo(0, 0);
    expect(m.y).toBeCloseTo(0, 0);
    const box = (await panelBox(page).boundingBox())!;
    const hotspot = page.getByRole('button', { name: 'Corner detail' });
    const hs = (await hotspot.boundingBox())!;
    expect(hs.width / box.width).toBeCloseTo(0.5, 1);

    // It is still clickable where it is drawn.
    await hotspot.click();
    await expectPanel(page, 'pStill');
    // A panel without an animation is not clipped or transformed.
    await expect.poll(async () => (await matrixOf(camera(page))).scale).toBe(1);
    await expect.poll(() => panelBox(page).evaluate((el) => (el as HTMLElement).style.overflow)).toBe('');
  });

  test('reduced motion shows the end state at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPlayer(page);
    await expectPanel(page, 'pSlide');
    await expect.poll(() => computed(layer(page, 'ly-caption'), 'opacity')).toBe('1');

    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'pCamera');
    await expect.poll(async () => (await matrixOf(camera(page))).scale).toBeCloseTo(2, 3);
  });

  test('page view animates every panel inside its own box', async ({ page }) => {
    await openPlayer(page);
    await page.getByRole('button', { name: 'Toggle between page and panel view' }).click();
    await expect(page.locator('.viewport-container.viewport-page')).toBeVisible();

    const content = (id: string) => page.locator(`.panel-container[data-panel-id="${id}"] .panel-content`);
    const cameraOf = (id: string) => content(id).locator('> .pw-panel-camera');

    await expect.poll(async () => (await matrixOf(cameraOf('pCamera'))).scale).toBeCloseTo(2, 3);
    await expect.poll(async () => (await matrixOf(cameraOf('pBoth'))).scale).toBeCloseTo(2, 3);
    expect((await matrixOf(cameraOf('pStill'))).scale).toBe(1);

    const size = await content('pCamera').evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
    const m = await matrixOf(cameraOf('pCamera'));
    expect(m.x).toBeCloseTo(-size.w, 0);
    expect(m.y).toBeCloseTo(-size.h, 0);

    await expect
      .poll(() => computed(page.locator('.panel-container[data-panel-id="pSlide"] [data-layer-id="ly-caption"]'), 'opacity'))
      .toBe('1');
  });
});
