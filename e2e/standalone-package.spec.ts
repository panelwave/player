import { test, expect, type Page } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The standalone player package (docs/STANDALONE.md): index.html + player/
 * from `npm run build:standalone`, plus a work with RELATIVE asset paths.
 * It must open from disk (file://) and from a static web server, in any
 * sub-directory. Run `npm run build:standalone` first; the suite is skipped
 * when the build is missing.
 */

const root = resolve(__dirname, '..');
const skeleton = join(root, 'dist', 'standalone-package');
const posterA = join(root, 'projects', 'demo', 'src', 'assets', 'video', 'video-demo-a-poster.jpg');
const posterB = join(root, 'projects', 'demo', 'src', 'assets', 'video', 'video-demo-b-poster.jpg');

const manifest = {
  panelwave: { version: '1.6.0', generator: 'panelwave-e2e/standalone' },
  meta: {
    id: 'work-e2e-standalone',
    title: { 'en-US': 'Standalone E2E', 'de-DE': 'Eigenständig E2E' },
    locales: ['en-US', 'de-DE'],
    default_locale: 'en-US',
  },
  assets: {
    catalog: [
      { id: 'img-a', category: 'image', variants: [{ src: 'assets/img-a/w1280.jpg', w: 1280, h: 720, mime: 'image/jpeg' }] },
      { id: 'img-b', category: 'image', variants: [{ src: 'assets/img-b/w1280.jpg', w: 1280, h: 720, mime: 'image/jpeg' }] },
    ],
  },
  chapters: [
    {
      id: 'ch-1',
      title: { 'en-US': 'Chapter' },
      panels: {
        pA: { title: { 'en-US': 'First' }, layers: [{ kind: 'image', id: 'ly-pA-bg', assetId: 'img-a', z: 0 }] },
        pB: { title: { 'en-US': 'Second' }, layers: [{ kind: 'image', id: 'ly-pB-bg', assetId: 'img-b', z: 0 }] },
      },
      graph: { entry: 'pA', edges: [{ from: 'pA', to: 'pB' }] },
    },
  ],
};

interface PackageOptions {
  inlineScript?: boolean;
  jsonFiles?: boolean;
  config?: Record<string, unknown>;
  title?: string;
}

/** Build one package into a fresh temp dir (inside a sub-directory, like a web space folder). */
function buildPackage(opts: PackageOptions = {}): { dir: string; base: string } {
  const base = mkdtempSync(join(tmpdir(), 'pw-standalone-'));
  const dir = join(base, 'my-comic');
  cpSync(skeleton, dir, { recursive: true });
  mkdirSync(join(dir, 'assets', 'img-a'), { recursive: true });
  mkdirSync(join(dir, 'assets', 'img-b'), { recursive: true });
  cpSync(posterA, join(dir, 'assets', 'img-a', 'w1280.jpg'));
  cpSync(posterB, join(dir, 'assets', 'img-b', 'w1280.jpg'));
  const config = opts.config ?? { showCover: false };
  if (opts.inlineScript ?? true) {
    writeFileSync(
      join(dir, 'panelwave.js'),
      `window.PANELWAVE_CONFIG = ${JSON.stringify(config)};\nwindow.PANELWAVE_MANIFEST = ${JSON.stringify(manifest)};\n`
    );
  }
  if (opts.jsonFiles) {
    writeFileSync(join(dir, 'panelwave.json'), JSON.stringify(manifest));
    writeFileSync(join(dir, 'panelwave.config.json'), JSON.stringify(config));
  }
  if (opts.title) {
    const indexPath = join(dir, 'index.html');
    writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace('<title>PanelWave</title>', `<title>${opts.title}</title>`));
  }
  return { dir, base };
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/** Minimal static server rooted at `base` (stands in for any web space). */
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

async function expectPanelImageLoaded(page: Page, layerId: string): Promise<void> {
  const img = page.locator(`[data-layer-id="${layerId}"] img`).first();
  await expect(img).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(await img.getAttribute('src')).toContain('assets/img-a/w1280.jpg');
}

test.describe('standalone player package', () => {
  test.skip(!existsSync(join(skeleton, 'player', 'main.js')), 'run `npm run build:standalone` first');

  const cleanup: string[] = [];
  test.afterAll(() => cleanup.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  test('opens from disk (file://) with relative asset paths', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const { dir, base } = buildPackage();
    cleanup.push(base);

    await page.goto(pathToFileURL(join(dir, 'index.html')).href);
    await expectPanelImageLoaded(page, 'ly-pA-bg');
    // Placeholder title replaced by the work's title.
    await expect(page).toHaveTitle('Standalone E2E');
    expect(errors).toEqual([]);
  });

  test('a title written into index.html is kept', async ({ page }) => {
    const { dir, base } = buildPackage({ title: 'My Own Site' });
    cleanup.push(base);
    await page.goto(pathToFileURL(join(dir, 'index.html')).href);
    await expectPanelImageLoaded(page, 'ly-pA-bg');
    await expect(page).toHaveTitle('My Own Site');
  });

  test('explains what is missing when panelwave.js is absent on file://', async ({ page }) => {
    const { dir, base } = buildPackage({ inlineScript: false, jsonFiles: true });
    cleanup.push(base);
    await page.goto(pathToFileURL(join(dir, 'index.html')).href);
    await expect(page.getByRole('alert')).toContainText('panelwave.js');
  });

  test('opens from a web server sub-directory (inline script)', async ({ page }) => {
    const { base } = buildPackage();
    cleanup.push(base);
    const { server, origin } = await serve(base);
    try {
      await page.goto(`${origin}/my-comic/`);
      await expectPanelImageLoaded(page, 'ly-pA-bg');
    } finally {
      server.close();
    }
  });

  test('falls back to panelwave.json on a web server', async ({ page }) => {
    const { base } = buildPackage({ inlineScript: false, jsonFiles: true });
    cleanup.push(base);
    const { server, origin } = await serve(base);
    try {
      await page.goto(`${origin}/my-comic/index.html`);
      await expectPanelImageLoaded(page, 'ly-pA-bg');
    } finally {
      server.close();
    }
  });

  test('?locale= picks a work locale', async ({ page }) => {
    const { dir, base } = buildPackage();
    cleanup.push(base);
    await page.goto(pathToFileURL(join(dir, 'index.html')).href + '?locale=de-DE');
    await expectPanelImageLoaded(page, 'ly-pA-bg');
    await expect(page).toHaveTitle('Eigenständig E2E');
  });
});
