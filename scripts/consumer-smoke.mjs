#!/usr/bin/env node
/**
 * Consumer smoke test: proves the packed @panelwave/player installs, builds
 * and renders in a freshly generated Angular app of a given major version.
 *
 * What it checks:
 *   1. `npm install <tarball>` into a new `ng new` app succeeds WITHOUT
 *      --legacy-peer-deps (i.e. the peer ranges accept that Angular major),
 *      and `npm ls` reports no invalid / missing peers.
 *   2. `ng build` (production) passes without a single warning: the
 *      partial-compiled library links with that major's linker and its .d.ts
 *      files type-check under the CLI's strict template defaults.
 *   3. The built app renders the demo's sample manifest in headless
 *      Chromium, `(ready)` fires, arrow-key navigation reaches the second
 *      panel, and the console stays free of errors. A screenshot is saved.
 *
 * The app is set up exactly as the package README describes (providers via
 * provideTranslateService, which ngx-translate 17 and 18 both have, i18n
 * assets, balloon fonts, allowedCommonJsDependencies), opens in panel view
 * (like the E2E suite; the default start is cover, then page view), with zoneless
 * change detection (the default for new Angular 21+ apps) unless --zone is
 * passed.
 *
 * Usage (from the repo root, after `ng build player --configuration production`):
 *   node scripts/consumer-smoke.mjs --angular 22
 *   node scripts/consumer-smoke.mjs --angular 20 --ngx-translate 17
 *   node scripts/consumer-smoke.mjs --angular 21 --tarball ../panelwave-player-x.y.z.tgz --keep
 *
 * Options:
 *   --angular <major>   Angular major for the consumer app (required)
 *   --ngx-translate <major>  @ngx-translate/core major to install (default 18)
 *   --tarball <path>    Use this package tarball instead of packing dist/player (the app
 *                       reads panelId from (panelChange) and needs ngx-translate 18
 *                       support: a release after 1.1.0)
 *   --workdir <dir>     Scratch directory (default: <os tmp>/pw-consumer-ng<major>-t<ngx-translate>)
 *   --screenshot <path> Screenshot file (default: test-results/consumer-smoke-ng<major>-t<ngx-translate>.png)
 *   --manifest <path>   Also render this manifest and require speech balloons within
 *                       its first 6 panels; screenshot saved as *-extra.png
 *   --zone              Generate a zone.js app instead of the CLI default
 *   --keep              Keep the scratch directory afterwards
 *
 * Needs a Node version the chosen Angular CLI supports (Angular 22: >= 22.22.3)
 * and the Playwright Chromium the repo's E2E suite uses.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repoRoot, 'package.json'));

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const major = option('angular');
if (!major || !/^\d+$/.test(major)) {
  console.error('usage: node scripts/consumer-smoke.mjs --angular <major> [--ngx-translate <major>] [--tarball <path>] [--workdir <dir>] [--screenshot <path>] [--manifest <path>] [--zone] [--keep]');
  process.exit(2);
}
const ngxMajor = option('ngx-translate') ?? '18';
if (!/^\d+$/.test(ngxMajor)) {
  console.error('--ngx-translate takes a major version, e.g. 17 or 18');
  process.exit(2);
}
const useZone = flag('zone');
const extraManifest = option('manifest') && resolve(option('manifest'));
const variant = `ng${major}-t${ngxMajor}${useZone ? '-zone' : ''}`;
const workdir = resolve(option('workdir') ?? join(tmpdir(), `pw-consumer-${variant}`));
const screenshot = resolve(option('screenshot') ?? join(repoRoot, 'test-results', `consumer-smoke-${variant}.png`));
const appName = 'consumer';
const appDir = join(workdir, appName);

// ---------------------------------------------------------------- helpers
const step = (msg) => console.log(`\n[consumer-smoke ${variant}] ${msg}`);
const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

/** Run a command, stream its output, and fail the smoke test on a non-zero exit. */
function run(cmd, args, cwd, { capture = false } = {}) {
  const res = spawnSync([cmd, ...args].map(quote).join(' '), {
    cwd,
    shell: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, NG_CLI_ANALYTICS: 'false', NG_FORCE_TTY: 'false', CI: process.env.CI ?? 'true' },
  });
  const out = capture ? `${res.stdout ?? ''}${res.stderr ?? ''}` : '';
  if (capture) process.stdout.write(out);
  if (res.status !== 0) {
    throw new Error(`\`${cmd} ${args.join(' ')}\` failed with exit code ${res.status}`);
  }
  return out;
}
const node = (script, args, cwd, opts) => run(process.execPath, [script, ...args], cwd, opts);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

// ---------------------------------------------------------------- steps
async function main() {
  step(`node ${process.version}, workdir ${workdir}`);
  rmSync(workdir, { recursive: true, force: true });
  mkdirSync(workdir, { recursive: true });

  // 1. The package under test.
  let tarball = option('tarball') && resolve(option('tarball'));
  if (!tarball) {
    const dist = join(repoRoot, 'dist', 'player');
    if (!existsSync(join(dist, 'package.json'))) {
      throw new Error('dist/player not found: run `ng build player --configuration production` first');
    }
    step('packing dist/player');
    run('npm', ['pack', dist, '--pack-destination', workdir], repoRoot);
    const { name, version } = readJson(join(dist, 'package.json'));
    tarball = join(workdir, `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`);
  }
  if (!existsSync(tarball)) throw new Error(`tarball not found: ${tarball}`);

  // 2. A fresh app from that major's CLI (installed locally: npx caches are flaky).
  step(`installing @angular/cli@${major}`);
  const cliDir = join(workdir, 'cli');
  mkdirSync(cliDir);
  writeJson(join(cliDir, 'package.json'), { private: true });
  run('npm', ['install', '--no-audit', '--no-fund', `@angular/cli@${major}`], cliDir);

  step('ng new');
  const newArgs = [
    'new', appName, '--defaults', '--skip-git', '--skip-tests', '--style=css',
    '--ssr=false', '--routing=false', '--package-manager=npm',
  ];
  if (Number(major) >= 20) newArgs.push('--ai-config=none');
  if (useZone) newArgs.push('--zoneless=false');
  node(join(cliDir, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'), newArgs, workdir);

  // 3. Install the player the way a host does. No --legacy-peer-deps: a peer
  //    range that excludes this Angular major must fail here.
  step(`npm install @panelwave/player + @ngx-translate/core@^${ngxMajor} (strict peer resolution)`);
  run('npm', ['install', '--no-audit', '--no-fund', tarball, `@ngx-translate/core@^${ngxMajor}`], appDir);
  run('npm', ['ls', '@panelwave/player', '@angular/core', '@angular/common', 'rxjs', 'json-logic-js', '@ngx-translate/core', 'tslib'], appDir);
  const versionOf = (pkg) => readJson(join(appDir, 'node_modules', pkg, 'package.json')).version;

  // 4. Wire the player in as the README describes.
  step('wiring the player into the app');
  const mainTs = readFileSync(join(appDir, 'src', 'main.ts'), 'utf8');
  if (!/import \{ App \} from '\.\/app\/app'/.test(mainTs) || !/appConfig/.test(mainTs)) {
    throw new Error(`unexpected src/main.ts layout from ng new ${major}:\n${mainTs}`);
  }
  writeFileSync(
    join(appDir, 'src', 'app', 'app.config.ts'),
    `import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners, ${useZone ? 'provideZoneChangeDetection' : 'provideZonelessChangeDetection'} } from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { TranslateLoader, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

class PlayerTranslateLoader implements TranslateLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string): Observable<TranslationObject> {
    return this.http.get<TranslationObject>(\`./assets/i18n/\${lang}.json\`);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    ${useZone ? 'provideZoneChangeDetection({ eventCoalescing: true })' : 'provideZonelessChangeDetection()'},
    provideHttpClient(),
    provideTranslateService({ loader: { provide: TranslateLoader, useClass: PlayerTranslateLoader } }),
  ],
};
`,
  );
  writeFileSync(
    join(appDir, 'src', 'app', 'app.ts'),
    `import { Component } from '@angular/core';
import { PlayerShellComponent, type PlayerPanelChangeEvent } from '@panelwave/player';

@Component({
  selector: 'app-root',
  imports: [PlayerShellComponent],
  template: \`
    <pw-player-shell
      [manifestUrl]="manifestUrl"
      locale="en-US"
      initialViewMode="panel"
      [showToolbar]="true"
      (ready)="flag('pwReady', 'true')"
      (panelChange)="onPanel($event)"
      (error)="flag('pwError', $event.message)" />
  \`,
  styles: \`:host { display: block; height: 100dvh; }\`,
})
export class App {
  readonly manifestUrl = new URLSearchParams(location.search).get('manifest') ?? 'sample-manifest.json';
  private panelChanges = 0;
  onPanel(e: PlayerPanelChangeEvent) {
    this.flag('pwChapter', e.chapter.id);
    this.flag('pwPanel', e.panelId);
    this.flag('pwPreviousPanel', e.previousPanelId ?? '');
    this.flag('pwPanelChanges', String(++this.panelChanges));
  }
  flag(key: string, value: string) {
    document.documentElement.dataset[key] = value;
  }
}
`,
  );
  copyFileSync(join(repoRoot, 'projects', 'demo', 'src', 'assets', 'sample-manifest.json'), join(appDir, 'public', 'sample-manifest.json'));
  if (extraManifest) copyFileSync(extraManifest, join(appDir, 'public', 'extra-manifest.json'));

  const angularJsonPath = join(appDir, 'angular.json');
  const angularJson = readJson(angularJsonPath);
  const build = angularJson.projects[appName].architect.build;
  build.options.assets = [
    ...(build.options.assets ?? []),
    { glob: '*.json', input: 'node_modules/@panelwave/player/src/assets/i18n', output: 'assets/i18n' },
  ];
  build.options.styles = ['node_modules/@panelwave/player/src/assets/fonts/balloon/balloon-fonts.css', ...(build.options.styles ?? [])];
  build.options.allowedCommonJsDependencies = [...(build.options.allowedCommonJsDependencies ?? []), 'json-logic-js'];
  // Bundle budgets are the host's business, not a compatibility signal.
  delete build.configurations?.production?.budgets;
  writeJson(angularJsonPath, angularJson);

  // 5. Production build: runs the Angular linker over the partial declarations.
  step('ng build (production)');
  const buildLog = node(join(appDir, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'), ['build'], appDir, { capture: true });
  // With the README setup the build must be clean: any warning (linker, CommonJS, ...) fails.
  if (/WARNING|linker|ɵɵngDeclare/i.test(buildLog)) throw new Error('the build log has warnings; inspect the output above');
  const browserDir = join(appDir, 'dist', appName, 'browser');
  const jsBytes = readdirSync(browserDir).filter((f) => f.endsWith('.js')).reduce((n, f) => n + statSync(join(browserDir, f)).size, 0);

  // 6. Render it.
  step('rendering in headless Chromium');
  const rendered = await renderCheck(browserDir);

  const summary = {
    angular: versionOf('@angular/core'),
    player: versionOf('@panelwave/player'),
    ngxTranslate: versionOf('@ngx-translate/core'),
    rxjs: versionOf('rxjs'),
    jsonLogic: versionOf('json-logic-js'),
    changeDetection: useZone ? 'zone.js' : 'zoneless',
    node: process.version,
    browserJsKB: Math.round(jsBytes / 1024),
    ...rendered,
    screenshot,
  };
  step(`PASS ${JSON.stringify(summary, null, 2)}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Consumer smoke: Angular ${summary.angular}, ngx-translate ${summary.ngxTranslate}\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`, { flag: 'a' });
  }
}

/** 1x1 dark-blue PNG: stands in for every manifest image. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQkbP5DwACJgFuhbKafgAAAABJRU5ErkJggg==', 'base64');

/** Serve the built app, drive it with Playwright, and screenshot it. */
async function renderCheck(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(root, path);
    const missing = !file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory();
    if (missing && /\.(png|jpe?g|webp|gif|avif)$/i.test(path)) {
      // Manifest art referenced by relative path: stand in the placeholder.
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(PNG);
    }
    if (missing && /.(mp3|m4a|ogg|oga|wav|mp4|webm|vtt)$/i.test(path)) {
      res.writeHead(404);
      return res.end();
    }
    if (missing) file = join(root, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;

  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const problems = [];
    page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    // The sample manifest's art lives on picsum.photos; keep the test hermetic.
    await page.route((u) => u.hostname !== '127.0.0.1', (route) =>
      route.request().resourceType() === 'image' || /picsum\.photos|pravatar\.cc/.test(route.request().url())
        ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
        : route.fulfill({ status: 204, body: '' }),
    );

    const ready = async () => {
      await page.locator('pw-player-shell .player-content').waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForFunction(() => document.documentElement.dataset['pwReady'] === 'true', null, { timeout: 15_000 });
      // Reading from the beginning opens on the work's cover; leave it for the entry panel.
      const cover = page.locator('pw-player-shell .pw-cover');
      if (await cover.isVisible()) {
        await cover.click();
        await cover.waitFor({ state: 'detached', timeout: 5_000 });
      }
    };
    const settle = () => page.waitForTimeout(1_000); // let transitions finish before a screenshot
    const failIfProblems = async () => {
      const error = await page.evaluate(() => document.documentElement.dataset['pwError']);
      if (error) problems.push(`player (error) output: ${error}`);
      if (problems.length) throw new Error(`render check found problems:\n  ${problems.join('\n  ')}`);
    };
    mkdirSync(dirname(screenshot), { recursive: true });

    await page.goto(url);
    await ready();
    await page.locator('.t-frame [data-layer-id="ly-p1-1-bg"]').waitFor({ state: 'visible', timeout: 15_000 });
    // UI strings come from the i18n assets the host copies: a raw key here means that wiring broke.
    const languageLabel = await page.locator('pw-player-shell [aria-label="Select language"]').count();
    if (!languageLabel) problems.push('toolbar has no translated "Select language" button (i18n assets not loaded?)');
    // Input -> state -> render round trip (exercises change detection).
    await page.keyboard.press('ArrowRight');
    await page.locator('.t-frame [data-layer-id="ly-p1-2-bg"]').waitFor({ state: 'visible', timeout: 15_000 });
    // (panelChange) fired for the entry panel and again for p1-2, with both ids.
    await page.waitForFunction(() => Number(document.documentElement.dataset['pwPanelChanges']) >= 2, null, { timeout: 5_000 });
    const ids = await page.evaluate(() => [document.documentElement.dataset['pwPanel'], document.documentElement.dataset['pwPreviousPanel']]);
    if (ids[0] !== 'p1-2' || ids[1] !== 'p1-1') problems.push(`(panelChange) ids: expected p1-2 from p1-1, got ${ids[0]} from ${ids[1]}`);
    const toolbarButtons = await page.locator('pw-player-shell button').count();
    await settle();
    await page.screenshot({ path: screenshot });
    await failIfProblems();
    const result = { rendered: true, navigatedTo: 'p1-2', translatedToolbar: true, buttonCount: toolbarButtons };

    // Optional second manifest (e.g. one with speech bubbles): loads, renders balloons, no errors.
    if (extraManifest) {
      // Sample manifests ship without their audio/video files; those load errors are expected.
      const mediaNoise = /Failed to play audio|Failed to load resource: the server responded with a status of 404/;
      page.removeAllListeners('console');
      page.on('console', (m) => m.type() === 'error' && !mediaNoise.test(m.text()) && problems.push(`console: ${m.text()}`));
      await page.goto(`${url}?manifest=extra-manifest.json`);
      await ready();
      // Step forward until a panel with balloons is on screen (entry panels are often covers).
      const bubble = page.locator('.speech-bubble-wrapper svg').first();
      for (let i = 0; i < 5 && !(await bubble.isVisible()); i++) {
        await page.keyboard.press('ArrowRight');
        await bubble.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
      }
      await bubble.waitFor({ state: 'visible', timeout: 5_000 });
      result.extraManifestBubbles = await page.locator('.speech-bubble-wrapper').count();
      await settle();
      await page.screenshot({ path: screenshot.replace(/\.png$/, '-extra.png') });
      await failIfProblems();
    }
    return result;
  } finally {
    await browser.close();
    server.close();
  }
}

main()
  .then(() => {
    if (!flag('keep')) rmSync(workdir, { recursive: true, force: true });
  })
  .catch((err) => {
    console.error(`\n[consumer-smoke ${variant}] FAIL: ${err.message}\n(scratch kept at ${workdir})`);
    process.exit(1);
  });
