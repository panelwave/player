import { test } from '@playwright/test';
import { expectBorderedPage, expectBorderedPanelView } from './helpers/borders';

/**
 * Panel borders (format 1.14.0) on a phone (Pixel 7 project): page view fits
 * the page to its panels; the right and lower line must stay on screen (the
 * pre-1.14 hairline sat outside the frame and was cut off exactly there).
 */
test.describe('panel borders on a phone (format 1.14.0)', () => {
  test('page view draws each panel border inside its frame, all four edges', async ({ page }) => {
    await expectBorderedPage(page);
  });

  test('panel view draws the border around the panel', async ({ page }) => {
    await expectBorderedPanelView(page);
  });
});
