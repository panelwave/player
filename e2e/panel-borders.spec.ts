import { test } from '@playwright/test';
import { expectBorderedPage, expectBorderedPanelView } from './helpers/borders';

/** Panel borders (format 1.14.0) on a desktop host — see helpers/borders.ts. */
test.describe('panel borders (format 1.14.0)', () => {
  test('page view draws each panel border inside its frame, all four edges', async ({ page }) => {
    await expectBorderedPage(page);
  });

  test('panel view draws the border around the panel', async ({ page }) => {
    await expectBorderedPanelView(page);
  });
});
