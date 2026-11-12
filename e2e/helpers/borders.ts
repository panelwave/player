import { expect, type Locator, type Page } from '@playwright/test';
import { openPlayer } from './player';

/**
 * Panel borders (format 1.14.0) on the demo's "Panel Borders" work
 * (projects/demo/src/assets/panel-borders-manifest.json, the format sample
 * 19): eight panels on an A4 page — the work default (near-black, 3 px,
 * solid) and per-panel overrides: dashed, dotted, double, rough, wavy (blue),
 * rounded corners, and a borderless rounded panel (thickness 0, radius 16).
 *
 * The line lies inside each frame, so all four edges are on screen — on a
 * phone too, where page view fits the page to its panels (before 1.14 the
 * right and lower hairline sat outside the frame and were cut off there).
 * The desktop and the mobile spec share these assertions.
 */
export const BORDERS_MANIFEST = '?manifest=assets/panel-borders-manifest.json';

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
};

const panel = (page: Page, id: string) => page.locator(`.pt-frame .page-canvas .panel-container[data-panel-id="${id}"]`);

export async function expectBorderedPage(page: Page): Promise<void> {
  await openPlayer(page, BORDERS_MANIFEST, { view: 'default' });
  const stage = page.locator('.page-stage');
  await expect(stage).toBeVisible();
  const s = await box(stage);

  // Every line lies inside its frame, and every frame on the stage: all four edges visible.
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) {
    const frame = panel(page, id);
    const svg = frame.locator('pw-panel-border svg');
    await expect(svg).toHaveCount(1);
    const f = await box(frame);
    const b = await box(svg);
    expect(Math.abs(b.x - f.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.y - f.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.x + b.width - (f.x + f.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(b.y + b.height - (f.y + f.height))).toBeLessThanOrEqual(1);
    expect(f.x).toBeGreaterThanOrEqual(s.x - 0.5);
    expect(f.y).toBeGreaterThanOrEqual(s.y - 0.5);
    expect(f.x + f.width).toBeLessThanOrEqual(s.x + s.width + 0.5);
    expect(f.y + f.height).toBeLessThanOrEqual(s.y + s.height + 0.5);
  }

  // p1 inherits the work style (#1b1b1b, 3 px, solid); p2 only overrides the style.
  const p1 = panel(page, 'p1').locator('pw-panel-border path');
  await expect(p1).toHaveAttribute('stroke', '#1b1b1b');
  await expect(p1).toHaveAttribute('stroke-width', '3');
  await expect(p1).not.toHaveAttribute('stroke-dasharray', /.+/);
  await expect(panel(page, 'p2').locator('pw-panel-border path')).toHaveAttribute('stroke-dasharray', '9 6');
  await expect(panel(page, 'p4').locator('pw-panel-border path')).toHaveCount(2);
  await expect(panel(page, 'p6').locator('pw-panel-border path')).toHaveAttribute('stroke', '#3b5bdb');

  // Outline-changing styles clip the frame; a straight solid one does not.
  const clip = (id: string) => panel(page, id).evaluate((el) => (el as HTMLElement).style.clipPath);
  expect(await clip('p1')).toBe('');
  expect(await clip('p5')).toContain('polygon(');
  expect(await clip('p6')).toContain('polygon(');
  expect(await clip('p7')).toContain('inset(0');

  // Thickness 0: no line, but the radius still rounds the panel.
  await expect(panel(page, 'p8').locator('pw-panel-border svg')).toHaveCount(0);
  expect(await clip('p8')).toContain('inset(0');

  // The page-view frame itself has no border of its own any more (the old hairline).
  const ownBorder = await panel(page, 'p1').evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(ownBorder).toBe('0px');
}

/** Panel view: the current panel carries the work's border too. */
export async function expectBorderedPanelView(page: Page): Promise<void> {
  await openPlayer(page, BORDERS_MANIFEST);
  const container = page.locator('.viewport-panel .t-frame .panel-container');
  await expect(container).toBeVisible();
  const path = container.locator('pw-panel-border path');
  await expect(path).toHaveCount(1);
  await expect(path).toHaveAttribute('stroke', '#1b1b1b');
  const c = await box(container);
  const svg = await box(container.locator('pw-panel-border svg'));
  expect(Math.abs(svg.width - c.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(svg.height - c.height)).toBeLessThanOrEqual(1);
}
