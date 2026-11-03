import { test } from '@playwright/test';
import { expectFramedPage } from './helpers/framed';

/** Framed page placements (schema 1.13) on a desktop host — see helpers/framed.ts. */
test.describe('framed placements (schema 1.13)', () => {
  test('page view shows the frame with the image box enlarged inside it', async ({ page }) => {
    await expectFramedPage(page);
  });
});
