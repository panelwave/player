import { test, expect, type Page } from '@playwright/test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { chaptersManifest, C2_UUID } from './fixtures/chapters-manifest';

/**
 * Chapter embeds (docs/MULTI_CHAPTER_EMBED.md): a course page on one origin
 * puts three chapters of a work between its own text, through the embed
 * loader (`player/panelwave-embed.js`) and a standalone package served from
 * ANOTHER origin. Checks lazy mounting, autoplay only while on screen and
 * only where configured, chapter boundaries, keyboard isolation and the
 * max-live limit.
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

/** The fixture work with local, relative artwork. */
function packagedManifest() {
  const manifest = JSON.parse(JSON.stringify(chaptersManifest));
  for (const item of manifest.assets.catalog) {
    item.variants = [{ src: 'assets/art.jpg', w: 1280, h: 720, mime: 'image/jpeg' }];
  }
  return manifest;
}

const TEXT = '<div class="text">Lesson text, images, a quiz…</div>';

function coursePage(packageOrigin: string, maxLive?: number): string {
  const src = `${packageOrigin}/course/index.html`;
  const live = maxLive ? ` data-max-live="${maxLive}"` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Course</title>
<style>body{margin:0;font:16px sans-serif}.intro{height:100px}.text{height:1200px;padding:16px;box-sizing:border-box}.panelwave-embed{width:800px;margin:0 auto}</style>
<script src="${packageOrigin}/course/player/panelwave-embed.js" defer></script></head><body>
<div class="intro">Course intro</div>
<div class="panelwave-embed" id="e1" data-src="${src}" data-chapter="c1" data-title="Chapter One"${live}></div>
${TEXT}
<div class="panelwave-embed" id="e2" data-src="${src}" data-chapter="${C2_UUID}" data-autoplay="true" data-title="Chapter Two"${live}></div>
${TEXT}
<div class="panelwave-embed" id="e3" data-src="${src}" data-chapter="c3" data-title="Chapter Three"${live}></div>
${TEXT}
<script>
window.pwLog = [];
['panelchange', 'chaptercomplete', 'autoplaychange', 'ready', 'mount', 'unmount'].forEach(function (n) {
  document.addEventListener('panelwave:' + n, function (e) { window.pwLog.push({ n: n, id: e.target.id, d: e.detail }); });
});
</script>
</body></html>`;
}

interface LogEntry {
  n: string;
  id: string;
  d: { panelId?: string; chapterId?: string } | boolean | null;
}

const log = (page: Page): Promise<LogEntry[]> => page.evaluate(() => (window as unknown as { pwLog: LogEntry[] }).pwLog);
const panelsOf = async (page: Page, id: string): Promise<string[]> =>
  (await log(page)).filter((e) => e.n === 'panelchange' && e.id === id).map((e) => (e.d as { panelId: string }).panelId);
/** Scroll so the element's top sits `offset` px below the viewport top. */
const scrollToEmbed = (page: Page, id: string, offset = 0) =>
  page.evaluate(
    ([id, offset]) => window.scrollTo(0, document.getElementById(id as string)!.offsetTop - (offset as number)),
    [id, offset]
  );

test.describe('multi-chapter embed (course page + loader + package on another origin)', () => {
  test.skip(
    !existsSync(join(skeleton, 'player', 'main.js')) || !existsSync(join(skeleton, 'player', 'panelwave-embed.js')),
    'run `npm run build:standalone` first'
  );
  test.use({ viewport: { width: 1280, height: 800 } });

  let base: string;
  let packageServer: { server: Server; origin: string };
  let hostServer: { server: Server; origin: string };
  let hostBase: string;

  test.beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'pw-embed-'));
    const dir = join(base, 'course');
    cpSync(skeleton, dir, { recursive: true });
    mkdirSync(join(dir, 'assets'), { recursive: true });
    cpSync(jpg, join(dir, 'assets', 'art.jpg'));
    writeFileSync(
      join(dir, 'panelwave.js'),
      `window.PANELWAVE_CONFIG = ${JSON.stringify({ showCover: false, chapters: { c3: { autoplay: true } } })};\n` +
        `window.PANELWAVE_MANIFEST = ${JSON.stringify(packagedManifest())};\n`
    );
    packageServer = await serve(base);
    hostBase = mkdtempSync(join(tmpdir(), 'pw-host-'));
    writeFileSync(join(hostBase, 'index.html'), coursePage(packageServer.origin));
    writeFileSync(join(hostBase, 'live2.html'), coursePage(packageServer.origin, 2));
    hostServer = await serve(hostBase);
  });

  test.afterAll(() => {
    packageServer?.server.close();
    hostServer?.server.close();
    rmSync(base, { recursive: true, force: true });
    rmSync(hostBase, { recursive: true, force: true });
  });

  test('mounts lazily and plays each chapter only while on screen', async ({ page }) => {
    test.slow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${hostServer.origin}/index.html`);

    // Only the first chapter loads with the page; the others wait as posters.
    await expect(page.locator('#e1')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(page.locator('#e2')).toHaveAttribute('data-pwe-state', 'poster');
    await expect(page.locator('#e3 .pwe-poster')).toBeVisible();
    expect(await panelsOf(page, 'e1')).toEqual(['a1']);

    // Near the viewport (800 px ahead) chapter 2 mounts — but a third of it
    // on screen is not enough to start its autoplay.
    await scrollToEmbed(page, 'e2', 650);
    await expect(page.locator('#e2')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
    await page.waitForTimeout(3500);
    expect(await panelsOf(page, 'e2')).toEqual(['b1']);

    // In view: it plays (panels last 1.5 s).
    await scrollToEmbed(page, 'e2', 100);
    await expect.poll(() => panelsOf(page, 'e2'), { timeout: 10_000 }).toContain('b2');

    // Scrolled away: it pauses …
    await scrollToEmbed(page, 'e1', 100);
    const paused = (await panelsOf(page, 'e2')).length;
    await page.waitForTimeout(3500);
    expect((await panelsOf(page, 'e2')).length).toBe(paused);

    // … and resumes in view, to the chapter's end — never into chapter 3.
    await scrollToEmbed(page, 'e2', 100);
    await expect
      .poll(async () => (await log(page)).some((e) => e.n === 'chaptercomplete' && e.id === 'e2'), { timeout: 15_000 })
      .toBe(true);
    await page.waitForTimeout(2500);
    expect(await panelsOf(page, 'e2')).toEqual(['b1', 'b2', 'b3']);
    expect((await log(page)).some((e) => e.n === 'autoplaychange' && e.id === 'e2' && e.d === false)).toBe(true);

    // Chapter 1 never autoplayed: autoplay is off for it.
    expect(await panelsOf(page, 'e1')).toEqual(['a1']);
    expect(errors).toEqual([]);
  });

  test('autoplay follows the chapter defaults when the page does not say', async ({ page }) => {
    // e3 has no data-autoplay → the loader sends autoplay=0, the URL wins over
    // the package's chapters.c3.autoplay default.
    test.slow();
    await page.goto(`${hostServer.origin}/index.html`);
    await scrollToEmbed(page, 'e3', 100);
    await expect(page.locator('#e3')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
    await page.waitForTimeout(3500);
    expect(await panelsOf(page, 'e3')).toEqual(['c3-1']);
  });

  test('keys reach only the focused chapter, which stops at its own end', async ({ page }) => {
    await page.goto(`${hostServer.origin}/index.html`);
    await expect(page.locator('#e1')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
    await scrollToEmbed(page, 'e2', 650);
    await expect(page.locator('#e2')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
    await scrollToEmbed(page, 'e1', 100);

    // The reader works in chapter 1: its iframe has the focus.
    await page.locator('#e1 iframe').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => panelsOf(page, 'e1')).toEqual(['a1', 'a2']);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(800);
    expect(await panelsOf(page, 'e1')).toEqual(['a1', 'a2']);
    expect((await log(page)).some((e) => e.n === 'chaptercomplete' && e.id === 'e1')).toBe(true);
    // Chapter 2 (not focused, off screen) did not move.
    expect(await panelsOf(page, 'e2')).toEqual(['b1']);
  });

  test('keeps at most data-max-live players mounted', async ({ page }) => {
    test.slow();
    await page.goto(`${hostServer.origin}/live2.html`);
    await expect(page.locator('#e1')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
    await scrollToEmbed(page, 'e2', 100);
    await expect(page.locator('#e2')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
    await scrollToEmbed(page, 'e3', 100);
    await expect(page.locator('#e3')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
    await expect(page.locator('iframe')).toHaveCount(2);
    await expect(page.locator('#e1')).toHaveAttribute('data-pwe-state', 'poster');
    // Back up: chapter 1 mounts again.
    await scrollToEmbed(page, 'e1', 100);
    await expect(page.locator('#e1')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
  });

  test('the JS API reads a chapter player’s state', async ({ page }) => {
    await page.goto(`${hostServer.origin}/index.html`);
    await expect(page.locator('#e1')).toHaveAttribute('data-pwe-state', 'ready', { timeout: 20_000 });
    const state = await page.evaluate(() =>
      (window as unknown as { PanelWaveEmbed: { get(el: Element): { getState(): Promise<unknown> } } }).PanelWaveEmbed
        .get(document.getElementById('e1')!)
        .getState()
    );
    expect(state).toEqual(jasmineLike({ chapterId: 'c1', chapterScope: 'c1', panelId: 'a1' }));
  });
});

/** Partial match without pulling in jasmine: Playwright's objectContaining. */
function jasmineLike(expected: Record<string, unknown>) {
  return expect.objectContaining(expected);
}
