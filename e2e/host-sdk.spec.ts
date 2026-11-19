import { test, expect, type Page } from '@playwright/test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { chaptersManifest } from './fixtures/chapters-manifest';

/**
 * Host SDK 2.0 + embed protocol 4 (docs/EMBEDDING.md, docs/EMBED_PROTOCOL.md):
 * a host page on one origin calls `PanelWave.mount()` for a standalone
 * package served from ANOTHER origin. Checks the port handshake (the SDK
 * talks over a MessagePort), whole-work mode, `resume`, `progress`,
 * `resize`, privacy mode (no analytics request), and that click-to-load makes
 * no request to the player's origin before the tap.
 *
 * Needs `npm run build:standalone` (it also builds the loader); skipped otherwise.
 */

const root = resolve(__dirname, '..');
const skeleton = join(root, 'dist', 'standalone-package');
const jpg = join(root, 'projects', 'demo', 'src', 'assets', 'video', 'video-demo-a-poster.jpg');

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

function serve(base: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const path = normalize(join(base, decodeURIComponent((req.url ?? '/').split('?')[0])));
    const file = path.endsWith('\\') || path.endsWith('/') ? join(path, 'index.html') : path;
    if (!file.startsWith(base) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      ok({ server, origin: `http://127.0.0.1:${port}` });
    })
  );
}

/** The fixture work with local artwork and an analytics endpoint on the package origin. */
function packagedManifest(analyticsUrl: string) {
  const manifest = JSON.parse(JSON.stringify(chaptersManifest));
  for (const item of manifest.assets.catalog) {
    item.variants = [{ src: 'assets/art.jpg', w: 1280, h: 720, mime: 'image/jpeg' }];
  }
  manifest.tracking = { consent: { required: false, defaultOptIn: true }, endpoint: analyticsUrl };
  return manifest;
}

/** A host page that mounts with the given options (JSON) and records SDK events. */
function hostPage(sdkUrl: string, mountOptions: Record<string, unknown>): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Host</title>
<style>body{margin:0;font:16px sans-serif}#host{width:800px}</style>
<script src="${sdkUrl}"></script></head><body>
<div id="host"></div>
<script>
window.sdkLog = [];
window.frameHandle = PanelWave.mount(document.getElementById('host'), ${JSON.stringify(mountOptions)});
['hello', 'ready', 'progress', 'resize', 'panelChange'].forEach(function (n) {
  window.frameHandle.on(n, function (d) { window.sdkLog.push({ n: n, d: d }); });
});
</script></body></html>`;
}

interface SdkEntry {
  n: string;
  d: Record<string, unknown>;
}

const sdkLog = (page: Page): Promise<SdkEntry[]> => page.evaluate(() => (window as unknown as { sdkLog: SdkEntry[] }).sdkLog);
const transport = (page: Page): Promise<string> =>
  page.evaluate(() => (window as unknown as { frameHandle: { transport: string } }).frameHandle.transport);

test.describe('host SDK 2.0 (PanelWave.mount + embed protocol 4)', () => {
  test.skip(
    !existsSync(join(skeleton, 'player', 'main.js')) || !existsSync(join(skeleton, 'player', 'panelwave-embed.js')),
    'run `npm run build:standalone` first'
  );
  test.use({ viewport: { width: 1280, height: 900 } });

  let base: string;
  let hostBase: string;
  let packageServer: { server: Server; origin: string };
  let hostServer: { server: Server; origin: string };

  test.beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'pw-sdk-'));
    packageServer = await serve(base);
    const dir = join(base, 'work');
    cpSync(skeleton, dir, { recursive: true });
    mkdirSync(join(dir, 'assets'), { recursive: true });
    cpSync(jpg, join(dir, 'assets', 'art.jpg'));
    writeFileSync(
      join(dir, 'panelwave.js'),
      `window.PANELWAVE_CONFIG = ${JSON.stringify({ showCover: false })};\n` +
        `window.PANELWAVE_MANIFEST = ${JSON.stringify(packagedManifest(`${packageServer.origin}/analytics`))};\n`
    );
    hostBase = mkdtempSync(join(tmpdir(), 'pw-sdk-host-'));
    hostServer = await serve(hostBase);
    const src = `${packageServer.origin}/work/index.html`;
    const sdk = `${packageServer.origin}/work/player/panelwave-embed.js`;
    writeFileSync(join(hostBase, 'eager.html'), hostPage(sdk, { src, aspect: '16/9', privacy: { tracking: false }, resume: { panelId: 'b2' } }));
    writeFileSync(join(hostBase, 'click.html'), hostPage(sdk, { src, loading: 'click', poster: { title: 'Night City', label: 'Read here' } }));
  });

  test.afterAll(() => {
    packageServer?.server.close();
    hostServer?.server.close();
    rmSync(base, { recursive: true, force: true });
    rmSync(hostBase, { recursive: true, force: true });
  });

  test('talks over a MessagePort, resumes, reports progress and shape, and sends no analytics in privacy mode', async ({ page }) => {
    test.slow();
    const analytics: string[] = [];
    page.on('request', (r) => r.url().includes('/analytics') && analytics.push(r.url()));
    await page.goto(`${hostServer.origin}/eager.html`);
    await expect(page.locator('#host')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 30_000 });
    await expect.poll(() => transport(page), { timeout: 10_000 }).toBe('port');

    const hello = (await sdkLog(page)).find((e) => e.n === 'hello')!.d as { protocol: number; capabilities: string[] };
    expect(hello.protocol).toBe(4);
    expect(hello.capabilities).toEqual(expect.arrayContaining(['port', 'progress', 'restore', 'resize', 'privacy']));

    // Whole work (no chapter scope), resumed at b2 of the second chapter.
    const frameUrl = new URL((await page.locator('#host iframe').getAttribute('src'))!);
    expect(frameUrl.searchParams.has('chapter')).toBe(false);
    expect(frameUrl.searchParams.get('track')).toBe('0');
    expect(frameUrl.searchParams.get('bridge')).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const getState = () =>
      page.evaluate(() =>
        (window as unknown as { frameHandle: { getState(): Promise<unknown> } }).frameHandle.getState()
      ) as Promise<{ panelId: string; chapterScope: string | null }>;
    // The jump after `restore` is asynchronous: wait for it.
    await expect.poll(async () => (await getState()).panelId, { timeout: 10_000 }).toBe('b2');
    expect((await getState()).chapterScope).toBeNull();

    // progress (debounced 2 s) and resize, applied to the box.
    await expect.poll(async () => (await sdkLog(page)).some((e) => e.n === 'progress'), { timeout: 10_000 }).toBe(true);
    const progress = (await sdkLog(page)).filter((e) => e.n === 'progress').pop()!.d;
    expect(progress).toEqual(expect.objectContaining({ panelId: 'b2', completed: false }));
    expect(typeof progress['percent']).toBe('number');
    const resize = (await sdkLog(page)).find((e) => e.n === 'resize')!.d as { aspect: number; minHeight: number };
    expect(resize.minHeight).toBe(320);
    const boxAspect = await page.locator('#host').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--pwe-aspect'));
    expect(boxAspect).toBe(`${Math.round(resize.aspect * 10000) / 10000} / 1`);

    // Commands go over the port: navigate and see the panel change come back.
    await page.evaluate(() => (window as unknown as { frameHandle: { navigate(id: string): void } }).frameHandle.navigate('b3'));
    await expect
      .poll(async () => (await sdkLog(page)).some((e) => e.n === 'panelChange' && e.d['panelId'] === 'b3'), { timeout: 10_000 })
      .toBe(true);
    await page.waitForTimeout(500);
    expect(analytics).toEqual([]);
  });

  test('click-to-load shows the host poster and asks nothing of the player origin before the tap', async ({ page }) => {
    const toPlayer: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (url.startsWith(packageServer.origin) && !url.endsWith('/panelwave-embed.js')) toPlayer.push(url);
    });
    await page.goto(`${hostServer.origin}/click.html`);
    const host = page.locator('#host');
    await expect(host).toHaveAttribute('data-pwe-state', 'poster');
    await expect(host.locator('.pwe-poster')).toContainText('Night City');
    await expect(host.locator('.pwe-poster')).toContainText('Read here');
    await page.waitForTimeout(1000);
    expect(toPlayer).toEqual([]);
    expect(await host.locator('iframe').count()).toBe(0);

    await host.locator('.pwe-poster').click();
    await expect(host).toHaveAttribute('data-pwe-state', 'ready', { timeout: 30_000 });
    expect(toPlayer.length).toBeGreaterThan(0);
    await expect.poll(() => transport(page), { timeout: 10_000 }).toBe('port');
  });
});
