#!/usr/bin/env node
/**
 * Builds the embed loader (projects/embed-loader, docs/MULTI_CHAPTER_EMBED.md)
 * into one dependency-free classic script:
 *
 *   dist/embed-loader/panelwave-embed.js   (IIFE, ES2018, minified)
 *   projects/player/embed-build/           (gitignored copy: ng-packagr only reads
 *                                           assets inside the project)
 *
 * It is shipped inside the npm package (`embed/panelwave-embed.js`, via
 * ng-package assets — build this before `ng build player`), copied into the
 * standalone package (`player/panelwave-embed.js`) and served by the reader
 * as `/embed.js`. Type-checks first; FAILS when the gzipped size exceeds the
 * budget.
 *
 *   node scripts/build-embed-loader.mjs
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = join(root, 'projects', 'embed-loader');
const outDir = join(root, 'dist', 'embed-loader');
const outFile = join(outDir, 'panelwave-embed.js');
export const GZIP_BUDGET_BYTES = 6 * 1024;

function fail(message) {
  console.error(`\nbuild-embed-loader: ${message}`);
  process.exit(1);
}

async function main() {
  try {
    execSync(`npx tsc -p "${join(project, 'tsconfig.json')}"`, { cwd: root, stdio: 'inherit' });
  } catch {
    fail('type check failed');
  }
  const core = readFileSync(join(project, 'src', 'core.ts'), 'utf8');
  const version = core.match(/LOADER_VERSION = '([^']+)'/)?.[1] ?? '0.0.0';
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [join(project, 'src', 'index.ts')],
    outfile: outFile,
    bundle: true,
    format: 'iife',
    target: 'es2018',
    minify: true,
    legalComments: 'none',
    banner: { js: `/*! panelwave-embed.js ${version} | MIT | https://github.com/panelwave/player */` },
  });
  const size = readFileSync(outFile);
  const gz = gzipSync(size, { level: 9 }).length;
  writeFileSync(join(outDir, 'VERSION.json'), JSON.stringify({ loaderVersion: version, bytes: size.length, gzipBytes: gz }, null, 2) + '\n');
  if (gz > GZIP_BUDGET_BYTES) fail(`panelwave-embed.js is ${gz} B gzipped, budget ${GZIP_BUDGET_BYTES} B`);
  const libCopy = join(root, 'projects', 'player', 'embed-build');
  mkdirSync(libCopy, { recursive: true });
  copyFileSync(outFile, join(libCopy, 'panelwave-embed.js'));
  console.log(`panelwave-embed.js ${version}: ${size.length} B, ${gz} B gzipped → ${outFile}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
