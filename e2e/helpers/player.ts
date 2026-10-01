import { Page, Route, expect } from '@playwright/test';

/**
 * Shared helpers for the player E2E suite.
 *
 * The demo manifests reference external placeholder images
 * (picsum.photos, i.pravatar.cc). E2E must not depend on third-party
 * uptime, so every external image request is fulfilled with a tiny
 * locally generated PNG instead.
 */

/** 1x1 dark-blue PNG, base64. Served for every stubbed image request. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQkbP5DwACJgFuhbKafgAAAABJRU5ErkJggg==',
  'base64'
);

const fulfillPng = (route: Route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG });

/** Stub all external image hosts used by the demo manifests. */
export async function stubExternalImages(page: Page): Promise<void> {
  await page.route('**://picsum.photos/**', fulfillPng);
  await page.route('**://fastly.picsum.photos/**', fulfillPng);
  await page.route('**://i.pravatar.cc/**', fulfillPng);
  // Catch-all for any other cross-origin image so no test ever waits on
  // the network. Same-origin (localhost) requests are never intercepted.
  // Registered last, so it takes precedence over the host routes above:
  // image hosts must still get the PNG here — the preloader fetch()es art
  // (resourceType "fetch"), and an empty 204 made every preload fail to decode.
  const IMAGE_HOSTS = /(^|\.)(picsum\.photos|pravatar\.cc)$/;
  await page.route(
    (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    (route) => {
      const request = route.request();
      const isImage = request.resourceType() === 'image' || IMAGE_HOSTS.test(new URL(request.url()).hostname);
      return isImage ? fulfillPng(route) : route.fulfill({ status: 204, body: '' });
    }
  );
}

/**
 * Serve `manifest` for the demo app's default sample-manifest request.
 * Must be called before `page.goto()`.
 */
export async function stubManifest(page: Page, manifest: unknown): Promise<void> {
  await page.route('**/assets/sample-manifest.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(manifest),
    })
  );
}

/**
 * Open the demo app and wait until the player shell has rendered the
 * first panel (`.player-content` only exists once the shell is ready).
 */
export async function openPlayer(page: Page, query = '', options: { keepCover?: boolean } = {}): Promise<void> {
  await stubExternalImages(page);
  await page.goto('/' + query);
  // Generous timeout: first loads against the ng dev server can be slow
  // when several browser workers start simultaneously.
  await expect(page.locator('pw-player-shell .player-content')).toBeVisible({ timeout: 30_000 });
  if (!options.keepCover) {
    await dismissCover(page);
  }
}

/**
 * Reading from the beginning opens on the work's cover; leave it for the
 * entry panel (a no-op for works without a cover). `expectCover` waits for
 * it first — after a manifest switch, which reloads asynchronously.
 */
export async function dismissCover(page: Page, expectCover = false): Promise<void> {
  const cover = page.locator('pw-player-shell .pw-cover');
  if (expectCover) {
    await expect(cover).toBeVisible({ timeout: 30_000 });
  }
  if (await cover.isVisible()) {
    await cover.click();
    await expect(cover).toHaveCount(0);
  }
}

/**
 * Locator for a panel's background layer inside the CURRENT (entering)
 * frame in panel view. The sample manifest names layers `ly-<panelId>-bg`,
 * so this doubles as the panel-identity assertion — panel view has no
 * `data-panel-id` attribute of its own.
 */
export function currentPanelLayer(page: Page, panelId: string) {
  return page.locator(`.t-frame [data-layer-id="ly-${panelId}-bg"]`);
}

/** Assert the player currently shows `panelId` (panel view). */
export async function expectPanel(page: Page, panelId: string, timeout?: number): Promise<void> {
  await expect(currentPanelLayer(page, panelId)).toBeVisible({ timeout });
}

/** The toolbar element is always in the DOM; visibility is a CSS class. */
export function toolbarContainer(page: Page) {
  return page.locator('.toolbar-container');
}
