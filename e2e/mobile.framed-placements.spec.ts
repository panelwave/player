import { test } from '@playwright/test';
import { expectFramedPage } from './helpers/framed';

/**
 * Framed page placements (schema 1.13) on a phone (Pixel 7 project): the same
 * frames as on desktop — page view fits the frames edge to edge (pageFit),
 * the hidden part of a framed image box takes no screen space.
 */
test.describe('framed placements on a phone (schema 1.13)', () => {
  test('page view shows the frame with the image box enlarged inside it', async ({ page }) => {
    await expectFramedPage(page);
  });
});
