#!/usr/bin/env node
/**
 * Builds the standalone player package skeleton (docs/STANDALONE.md):
 *
 *   dist/standalone-package/
 *   ├── index.html            loads panelwave.js, then player/polyfills.js + player/main.js
 *   └── player/
 *       ├── main.js, polyfills.js, styles.css, media/   (Angular build of projects/standalone)
 *       ├── LICENSE                                     (MIT, from the repo root)
 *       └── VERSION.json                                { playerVersion, commit, builtAt }
 *
 * A host (e.g. the PanelWave CMS "Package with player" export) adds the work
 * next to index.html: panelwave.js, panelwave.json, assets/, fonts/.
 *
 * The page must work from disk (file://), where browsers refuse module
 * scripts. The Angular build emits `type="module"` tags although the bundles
 * contain no import/export statements, so the tags are rewritten to classic
 * `defer` scripts. Each bundle is wrapped in a strict-mode IIFE: as a classic
 * script its top-level `var`s would otherwise become window properties and
 * collide with built-ins (`name`, `top`, `status`… — `window.name` coerces to
 * a string), which a module never does. The build FAILS if a bundle ever
 * starts to need real module semantics (top-level import/export,
 * import.meta, dynamic import, lazy chunks).
 *
 *   node scripts/build-standalone.mjs              # builds the library first
 *   node scripts/build-standalone.mjs --skip-lib   # reuse dist/player
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'dist', 'standalone', 'browser');
const outDir = join(root, 'dist', 'standalone-package');
const skipLib = process.argv.includes('--skip-lib');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

function fail(message) {
  console.error(`\nbuild-standalone: ${message}`);
  process.exit(1);
}

/**
 * Reasons a bundle cannot run as a classic script (empty = fine). Exported
 * logic is mirrored by the unit test of this script's rules in
 * scripts/build-standalone.test.mjs.
 */
export function moduleSyntaxProblems(source) {
  const problems = [];
  if (/(^|[;\n}])\s*import\s*(?:[\w*{]|["'])/.test(source)) problems.push('top-level import statement');
  if (/(^|[;\n}])\s*export\s*(?:[\w*{]|default\b)/.test(source)) problems.push('top-level export statement');
  if (/\bimport\.meta\b/.test(source)) problems.push('import.meta');
  if (/\bimport\s*\(/.test(source)) problems.push('dynamic import()');
  return problems;
}

/**
 * A module bundle as a classic script with module-like scoping: its own
 * function scope (no globals leak) and strict mode (modules are strict).
 * The newline before the closer keeps a trailing `//` comment from eating it.
 */
export function wrapAsClassicScript(source) {
  return `(function () {\n"use strict";\n${source}\n})();\n`;
}

/** index.html with the CLI's module tags turned into classic deferred scripts under player/. */
export function rewriteIndexHtml(html) {
  let out = html.replace(/<link rel="stylesheet" href="styles\.css">/, '<link rel="stylesheet" href="player/styles.css">');
  out = out.replace(/<script src="(polyfills|main)\.js" type="module"><\/script>/g, '<script src="player/$1.js" defer></script>');
  if (/type="module"/.test(out)) fail('index.html still contains a module script tag');
  for (const needed of ['player/styles.css', 'player/polyfills.js', 'player/main.js', 'panelwave.js']) {
    if (!out.includes(needed)) fail(`index.html does not reference ${needed}`);
  }
  // Load order: panelwave.js (sets the globals) must come before the player.
  if (out.indexOf('panelwave.js') > out.indexOf('player/main.js')) fail('panelwave.js must load before player/main.js');
  return out;
}

function main() {
  if (!skipLib) run('npx ng build player');
  run('npx ng build standalone --configuration production');

  if (!existsSync(join(buildDir, 'main.js'))) fail(`missing ${buildDir}/main.js`);
  const files = readdirSync(buildDir);
  const chunks = files.filter((f) => /^chunk-.*\.js$/.test(f));
  if (chunks.length) fail(`lazy chunks are not supported on file:// (${chunks.join(', ')})`);
  for (const bundle of ['main.js', 'polyfills.js']) {
    const problems = moduleSyntaxProblems(readFileSync(join(buildDir, bundle), 'utf8'));
    if (problems.length) fail(`${bundle} needs module semantics: ${problems.join(', ')}`);
  }

  rmSync(outDir, { recursive: true, force: true });
  const playerDir = join(outDir, 'player');
  mkdirSync(playerDir, { recursive: true });
  for (const f of files) {
    if (f === 'index.html') continue;
    if (f === 'main.js' || f === 'polyfills.js') {
      writeFileSync(join(playerDir, f), wrapAsClassicScript(readFileSync(join(buildDir, f), 'utf8')));
    } else {
      cpSync(join(buildDir, f), join(playerDir, f), { recursive: true });
    }
  }
  writeFileSync(join(outDir, 'index.html'), rewriteIndexHtml(readFileSync(join(buildDir, 'index.html'), 'utf8')));
  cpSync(join(root, 'LICENSE'), join(playerDir, 'LICENSE'));

  const playerVersion = JSON.parse(readFileSync(join(root, 'projects', 'player', 'package.json'), 'utf8')).version;
  let commit = '';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  } catch {
    // not a git checkout — leave empty
  }
  writeFileSync(
    join(playerDir, 'VERSION.json'),
    JSON.stringify({ playerVersion, commit, builtAt: new Date().toISOString() }, null, 2) + '\n'
  );

  console.log(`\nStandalone package skeleton: ${outDir} (player ${playerVersion}${commit ? ', ' + commit : ''})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
