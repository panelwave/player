import { test, expect, type Page } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

/**
 * Content widgets in a print render (schema 1.10 widget `print`; the CMS PDF
 * export prints each page through the standalone player with `print: true`
 * and `printOptions`): every widget becomes a static card, by default with a
 * QR code that opens its panel in the online reader; `print: "hide"` or the
 * export's `widgets: "hide"` leaves it out. Run `npm run build:standalone`
 * first; skipped when the build is missing.
 */

const root = resolve(__dirname, '..');
const skeleton = join(root, 'dist', 'standalone-package');
const demoAssets = join(root, 'projects', 'demo', 'src', 'assets');
const READER = 'https://read.panelwave.org/acme/meanders';
const SHOTS = process.env['PRINT_SHOTS'];

/** The demo's widget work on one A4 portrait page, background as an inline SVG (no network). */
function printManifest(hideAudio = false): Record<string, unknown> {
  const m = JSON.parse(readFileSync(join(demoAssets, 'widgets-manifest.json'), 'utf8'));
  const bg = m.assets.catalog.find((a: { id: string }) => a.id === 'img-bg');
  bg.variants = [{
    src: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1152"><rect width="2048" height="1152" fill="#9ec5d6"/><path d="M0 700 C 600 600, 1400 820, 2048 640 L2048 1152 L0 1152 Z" fill="#6f9a5b"/></svg>'),
    w: 2048, h: 1152,
  }];
  const ch = m.chapters[0];
  ch.pages[0].layout = { format: 'a4-portrait', placements: [{ panelId: 'pw-1', x: 0.04, y: 0.1, w: 0.92, h: 0.52 }] };
  if (hideAudio) ch.panels['pw-1'].layers.find((l: { kind: string }) => l.kind === 'audioPlayer').print = 'hide';
  return m;
}

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };

async function serve(dir: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = normalize(join(dir, path === '/' ? 'index.html' : path));
    if (!file.startsWith(dir) || !existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}` };
}

async function openPrint(page: Page, printOptions: Record<string, unknown> | undefined, hideAudio = false) {
  const dir = mkdtempSync(join(tmpdir(), 'pw-print-widgets-'));
  cpSync(skeleton, dir, { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  cpSync(join(demoAssets, 'widgets'), join(dir, 'assets', 'widgets'), { recursive: true });
  cpSync(join(demoAssets, 'video'), join(dir, 'assets', 'video'), { recursive: true });
  const config = { print: true, pageFormat: 'a4-portrait', showCover: false, showToolbar: false, ...(printOptions ? { printOptions } : {}) };
  writeFileSync(join(dir, 'panelwave.js'), `window.PANELWAVE_CONFIG = ${JSON.stringify(config)};\nwindow.PANELWAVE_MANIFEST = ${JSON.stringify(printManifest(hideAudio))};\n`);
  const { server, origin } = await serve(dir);
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.goto(`${origin}/index.html?page=pg-widgets`);
  await expect(page.locator('.page-canvas [data-layer-id="ly-bg"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  return { close: () => { server.close(); rmSync(dir, { recursive: true, force: true }); } };
}

const widget = (page: Page, kind: string) => page.locator(`.page-canvas [data-pw-widget="${kind}"]`);

test.describe('content widgets in print renders', () => {
  test.skip(!existsSync(join(skeleton, 'index.html')), 'run npm run build:standalone first');

  test('cards with QR codes to the panel in the online reader', async ({ page }) => {
    const p = await openPrint(page, { widgets: 'qr', linkBase: READER, attachments: { 'file-worksheet': 3 } });
    try {
      const link = `${READER}?panel=pw-1`;
      for (const kind of ['download', 'audioPlayer', 'videoPlayer', 'scrollText', 'iframe']) {
        await expect(widget(page, kind).locator('pw-print-qr svg')).toBeVisible();
        await expect(widget(page, kind).locator('pw-print-qr')).toHaveAttribute('data-href', link);
      }
      await expect(widget(page, 'audioPlayer').locator('pw-print-qr')).toContainText('Scan to listen');
      await expect(widget(page, 'download').locator('.attached')).toHaveText('Printed on page 3');
      // Nothing to click or play on paper; no iframe loads.
      await expect(widget(page, 'download').locator('a')).not.toHaveAttribute('href', /.+/);
      await expect(page.locator('.page-canvas iframe')).toHaveCount(0);
      // QR codes stay square.
      const box = (await widget(page, 'audioPlayer').locator('pw-print-qr svg').boundingBox())!;
      expect(Math.abs(box.width - box.height)).toBeLessThan(1.5);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'print-widgets-qr.png') });
    } finally {
      p.close();
    }
  });

  test('cards without codes, a widget hidden by its own setting, all hidden by the export', async ({ page }) => {
    let p = await openPrint(page, { widgets: 'card', linkBase: READER }, true);
    try {
      await expect(page.locator('.page-canvas pw-print-qr')).toHaveCount(0);
      await expect(widget(page, 'audioPlayer')).toHaveCount(0);
      await expect(widget(page, 'videoPlayer')).toBeVisible();
    } finally {
      p.close();
    }
    p = await openPrint(page, { widgets: 'hide', linkBase: READER });
    try {
      await expect(page.locator('.page-canvas [data-pw-widget]')).toHaveCount(0);
      await expect(page.locator('.page-canvas [data-layer-id="ly-bg"]')).toBeVisible();
    } finally {
      p.close();
    }
  });

  test('without a reader link the cards carry no code', async ({ page }) => {
    const p = await openPrint(page, undefined);
    try {
      await expect(widget(page, 'download')).toBeVisible();
      await expect(page.locator('.page-canvas pw-print-qr')).toHaveCount(0);
    } finally {
      p.close();
    }
  });
});
