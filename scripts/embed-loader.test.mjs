/**
 * Unit tests of the embed loader's pure logic (projects/embed-loader/src/core.ts).
 * The TypeScript module is bundled with esbuild in memory and imported.
 *
 *   node --test scripts/embed-loader.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({
  entryPoints: [join(root, 'projects', 'embed-loader', 'src', 'core.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
});
const core = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));

const attrs = (map) => (name) => (name in map ? map[name] : null);
const BASE = 'https://course.example/lessons/one.html';

test('readOptions: defaults', () => {
  const result = core.readOptions(attrs({ src: 'https://read.panelwave.org/acme/aid', chapter: 'ch-1' }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.options, {
    src: 'https://read.panelwave.org/acme/aid',
    chapter: 'ch-1',
    autoplay: false,
    loading: 'auto',
    aspect: '16 / 9',
    toolbar: true,
    cover: false,
    maxLive: 3,
    exclusiveAudio: false,
  });
});

test('readOptions: every attribute', () => {
  const result = core.readOptions(
    attrs({
      src: './course/index.html',
      chapter: '7c1e0000-0000-4000-8000-000000000002',
      autoplay: 'true',
      loading: 'click',
      poster: 'posters/2.webp',
      title: 'Chapter 2',
      aspect: '4:3',
      locale: 'de-DE',
      toolbar: '0',
      cover: '',
      'seconds-per-panel': '4',
      'max-live': '2',
      'exclusive-audio': '',
    })
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.options, {
    src: './course/index.html',
    chapter: '7c1e0000-0000-4000-8000-000000000002',
    autoplay: true,
    loading: 'click',
    poster: 'posters/2.webp',
    title: 'Chapter 2',
    aspect: '4 / 3',
    locale: 'de-DE',
    toolbar: false,
    cover: true,
    secondsPerPanel: 4,
    maxLive: 2,
    exclusiveAudio: true,
  });
});

test('readOptions: rejects missing or unsafe src and a malformed chapter', () => {
  assert.equal(core.readOptions(attrs({ chapter: 'c' })).ok, false);
  assert.equal(core.readOptions(attrs({ src: 'javascript:alert(1)', chapter: 'c' })).ok, false);
  assert.equal(core.readOptions(attrs({ src: 'data:text/html,x', chapter: 'c' })).ok, false);
  assert.equal(core.readOptions(attrs({ src: 'a.html', chapter: '<x>' })).ok, false);
});

test('readOptions 2.0: no chapter = the whole work; channel, privacy, purchase UI, theme', () => {
  const whole = core.readOptions(attrs({ src: 'a.html' }));
  assert.equal(whole.ok, true);
  assert.equal(whole.options.chapter, undefined);
  const { options } = core.readOptions(attrs({ src: 'a.html', channel: 'peoplecomics', track: '0', 'purchase-ui': 'link_out', theme: 'dark' }));
  assert.equal(options.channel, 'peoplecomics');
  assert.equal(options.track, false);
  assert.equal(options.purchaseUi, 'link_out');
  assert.equal(options.theme, 'dark');
  const bad = core.readOptions(attrs({ src: 'a.html', channel: 'Not A Key', 'purchase-ui': 'buy', theme: 'pink' })).options;
  assert.equal(bad.channel, undefined);
  assert.equal(bad.purchaseUi, undefined);
  assert.equal(bad.theme, undefined);
  assert.equal(bad.track, undefined);
});

test('fromMountOptions: mount() options get the same validation, eager by default', () => {
  const r = core.fromMountOptions({ src: 'https://read.panelwave.org/a/b', channel: 'roadbeat', privacy: { tracking: false }, purchaseUi: 'hidden', poster: { image: 'https://cdn/c.jpg', title: 'Night City' }, aspect: '3/4' });
  assert.equal(r.ok, true);
  assert.equal(r.options.loading, 'eager');
  assert.equal(r.options.track, false);
  assert.equal(r.options.purchaseUi, 'hidden');
  assert.equal(r.options.poster, 'https://cdn/c.jpg');
  assert.equal(r.options.title, 'Night City');
  assert.equal(r.options.aspect, '3 / 4');
  assert.equal(core.fromMountOptions({ src: 'javascript:alert(1)' }).ok, false);
  assert.equal(core.fromMountOptions({ src: 'a.html', loading: 'click' }).options.loading, 'click');
});

test('buildFrameUrl 2.0: whole work, channel, privacy, purchase UI and the bridge nonce', () => {
  const { options } = core.readOptions(attrs({ src: 'https://read.panelwave.org/acme/aid?chapter=old', channel: 'peoplecomics', track: '0', 'purchase-ui': 'hidden' }));
  const url = new URL(core.buildFrameUrl(options, BASE, 'https://catalog.example', 'abcdefghijklmnopqrstuv'));
  assert.equal(url.searchParams.has('chapter'), false);
  assert.equal(url.searchParams.get('ch'), 'peoplecomics');
  assert.equal(url.searchParams.get('track'), '0');
  assert.equal(url.searchParams.get('pui'), 'hidden');
  assert.equal(url.searchParams.get('bridge'), 'abcdefghijklmnopqrstuv');
});

test('newNonce and resizeAspect', () => {
  const nonce = core.newNonce((bytes) => bytes.fill(255));
  assert.match(nonce, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(core.resizeAspect({ aspect: 0.70710678, minHeight: 320 }), '0.7071 / 1');
  assert.equal(core.resizeAspect({ aspect: 'x' }), null);
  assert.equal(core.resizeAspect({ aspect: 50 }), null);
  assert.equal(core.resizeAspect(null), null);
});

test('readOptions: drops malformed optional values', () => {
  const { options } = core.readOptions(
    attrs({ src: 'a.html', chapter: 'c', locale: 'x"y', 'seconds-per-panel': '999', 'max-live': '0', poster: 'javascript:x', loading: 'soon' })
  );
  assert.equal(options.locale, undefined);
  assert.equal(options.secondsPerPanel, undefined);
  assert.equal(options.poster, undefined);
  assert.equal(options.maxLive, 3);
  assert.equal(options.loading, 'auto');
});

test('parseAspect', () => {
  assert.equal(core.parseAspect('16/9'), '16 / 9');
  assert.equal(core.parseAspect('210 / 297'), '210 / 297');
  assert.equal(core.parseAspect('3x4'), '3 / 4');
  assert.equal(core.parseAspect('1.5'), '1.5 / 1');
  assert.equal(core.parseAspect('0/9'), '16 / 9');
  assert.equal(core.parseAspect('wide'), '16 / 9');
  assert.equal(core.parseAspect(null), '16 / 9');
});

test('buildFrameUrl: hosted reader', () => {
  const { options } = core.readOptions(attrs({ src: 'https://read.panelwave.org/acme/aid?lang=en', chapter: 'ch-2', autoplay: '1', locale: 'de-DE', 'seconds-per-panel': '3' }));
  const url = new URL(core.buildFrameUrl(options, BASE, 'https://course.example'));
  assert.equal(url.origin + url.pathname, 'https://read.panelwave.org/acme/aid');
  assert.equal(url.searchParams.get('embed'), '1');
  assert.equal(url.searchParams.get('origin'), 'https://course.example');
  assert.equal(url.searchParams.get('chapter'), 'ch-2');
  assert.equal(url.searchParams.get('autoplay'), '1');
  assert.equal(url.searchParams.get('toolbar'), '1');
  assert.equal(url.searchParams.get('cover'), '0');
  assert.equal(url.searchParams.get('lang'), 'de-DE');
  assert.equal(url.searchParams.get('spp'), '3');
});

test('buildFrameUrl: package relative to the page, opaque host origin left out', () => {
  const { options } = core.readOptions(attrs({ src: '../course/index.html', chapter: 'ch-1' }));
  const url = new URL(core.buildFrameUrl(options, 'file:///C:/site/lessons/one.html', 'null'));
  assert.equal(url.href.startsWith('file:///C:/site/course/index.html?'), true);
  assert.equal(url.searchParams.has('origin'), false);
  assert.equal(url.searchParams.get('autoplay'), '0');
});

test('frameOrigin', () => {
  assert.equal(core.frameOrigin('../course/index.html', BASE), 'https://course.example');
  assert.equal(core.frameOrigin('https://read.panelwave.org/a/b', BASE), 'https://read.panelwave.org');
  assert.equal(core.frameOrigin('index.html', 'file:///C:/x/y.html'), null);
});

test('resolveStrategy', () => {
  assert.equal(core.resolveStrategy('auto', true, false), 'eager');
  assert.equal(core.resolveStrategy('auto', false, false), 'lazy');
  assert.equal(core.resolveStrategy('eager', false, false), 'eager');
  assert.equal(core.resolveStrategy('lazy', true, false), 'lazy');
  assert.equal(core.resolveStrategy('click', true, false), 'click');
  assert.equal(core.resolveStrategy('auto', true, true), 'click');
  assert.equal(core.resolveStrategy('eager', false, true), 'eager');
});

test('pickUnmount: farthest off-screen first, never a visible one', () => {
  const live = [
    { id: 1, distance: 3000, visible: false },
    { id: 2, distance: 0, visible: true },
    { id: 3, distance: 500, visible: false },
    { id: 4, distance: 0, visible: true },
  ];
  assert.deepEqual(core.pickUnmount(live, 3), [1]);
  assert.deepEqual(core.pickUnmount(live, 2), [1, 3]);
  assert.deepEqual(core.pickUnmount(live, 1), [1, 3]);
  assert.deepEqual(core.pickUnmount(live, 4), []);
});

test('viewportDistance', () => {
  assert.equal(core.viewportDistance(-500, -100, 800), 100);
  assert.equal(core.viewportDistance(1000, 1500, 800), 200);
  assert.equal(core.viewportDistance(100, 400, 800), 0);
});

test('player messages and DOM event names', () => {
  assert.equal(core.isPlayerMessage({ type: 'pw:ready' }), true);
  assert.equal(core.isPlayerMessage({ type: 'config' }), false);
  assert.equal(core.isPlayerMessage(null), false);
  assert.equal(core.domEventName('chapterComplete'), 'panelwave:chaptercomplete');
});
