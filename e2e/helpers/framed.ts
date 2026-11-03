import { expect, type Locator, type Page } from '@playwright/test';
import { openPlayer } from './player';

/**
 * Framed page placements (schema 1.13) on the demo's "Framed Placements" work
 * (projects/demo/src/assets/framed-manifest.json, the format sample 18): an
 * A4 page with a square frame at the page's left edge zoomed 2× into the
 * right half of a 16:9 image (its image box starts left of the page), a 4:1
 * strip from the middle of a second image, and an unframed third panel.
 *
 * Page view must show the FRAME as the panel on every host width — the
 * desktop and the mobile spec share these assertions; player 1.5–2.0 cropped
 * on phones only.
 */
export const FRAMED_MANIFEST = '?manifest=assets/framed-manifest.json';

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
};

export async function expectFramedPage(page: Page): Promise<void> {
  await openPlayer(page, FRAMED_MANIFEST, { view: 'default' });
  const canvas = page.locator('.pt-frame .page-canvas');
  await expect(canvas).toBeVisible();

  const frame = canvas.locator('.panel-container[data-panel-id="p1"]');
  await expect(frame).toBeVisible();
  const c = await box(canvas);
  const f = await box(frame);
  // The frame is half the page wide and starts at the page's left edge …
  expect(f.width / c.width).toBeGreaterThan(0.48);
  expect(f.width / c.width).toBeLessThan(0.52);
  expect(Math.abs(f.x - c.x)).toBeLessThan(2);
  // … and square (A4 is 794 × 1123: 0.5 of the width = 0.3535 of the height)
  expect(f.height / f.width).toBeGreaterThan(0.97);
  expect(f.height / f.width).toBeLessThan(1.03);

  // The image box inside it is 1 / vw = 3.556 frames wide and starts left of the page.
  const content = await box(frame.locator('.panel-content'));
  expect(content.width / f.width).toBeGreaterThan(3.5);
  expect(content.width / f.width).toBeLessThan(3.6);
  expect(content.x).toBeLessThan(c.x - 1);

  // The 4:1 strip: frame 4:1, box 16:9 behind it.
  const strip = canvas.locator('.panel-container[data-panel-id="p2"]');
  const s = await box(strip);
  expect(s.width / s.height).toBeGreaterThan(3.9);
  expect(s.width / s.height).toBeLessThan(4.1);
  const stripContent = await box(strip.locator('.panel-content'));
  expect(stripContent.height / s.height).toBeGreaterThan(2.2);
  expect(stripContent.height / s.height).toBeLessThan(2.3);

  // An unframed placement is its own frame (the frame element's 1 px border makes the content 2 px narrower).
  const plain = canvas.locator('.panel-container[data-panel-id="p3"]');
  const p = await box(plain);
  const plainContent = await box(plain.locator('.panel-content'));
  expect(Math.abs(plainContent.width - p.width)).toBeLessThanOrEqual(3);
  expect(Math.abs(plainContent.x - p.x)).toBeLessThanOrEqual(2);
}
