# Standalone package — self-hosting one work

The standalone app (`projects/standalone`) is the player as a finished web
page for **one** work. A folder with this page and a work opens

- **from disk** — double-click `index.html` (a `file://` URL), and
- **from any static web space** — upload the folder by FTP/SFTP, into any
  sub-directory, and open its URL.

No server code, no build step and no PanelWave account are needed to read it.
The PanelWave CMS export **"Package with player (.zip)"** produces such a
folder; you can also assemble one by hand.

## Package layout

```
my-comic/
├── index.html            from the standalone build
├── player/               from the standalone build (main.js, polyfills.js, styles.css, media/, LICENSE, VERSION.json)
├── panelwave.js          the work: window.PANELWAVE_MANIFEST = {…}; window.PANELWAVE_CONFIG = {…};
├── panelwave.json        the same manifest as plain JSON (optional; used over http when panelwave.js is absent)
├── panelwave.config.json the same config as plain JSON (optional)
├── assets/…              images, video, audio — referenced by RELATIVE paths in the manifest
└── fonts/custom-fonts.css  optional: @font-face rules for fonts you licensed yourself
```

The manifest must reference media by **relative** paths (`assets/img-a/w1280.webp`)
and must not set `assets.base`; the player then resolves every path against
the page. Absolute URLs (`https://…`) keep working but need a connection.

## Boot rules

1. `window.PANELWAVE_MANIFEST` (set by the classic script `panelwave.js`)
   wins. This is the only source that works from `file://`, where browsers
   block `fetch()` and module scripts.
2. Without it, on `http(s)`, the page fetches `./panelwave.json` and
   `./panelwave.config.json` (a missing config means defaults).
3. Without it on `file://`, the page explains that `panelwave.js` is missing.

Config (`PANELWAVE_CONFIG` / `panelwave.config.json`), all optional:

| Key | Default | Meaning |
|---|---|---|
| `locale` | `meta.default_locale` | Start language; used only when it is one of `meta.locales` |
| `showCover` | `true` | Open on the work's cover |
| `showToolbar` | `true` | Show the reader toolbar |
| `pageFormat` | chosen by screen size | Page format to show, e.g. `a4-portrait` (used when the work has pages in it) |
| `viewMode` | page view when the work has pages | Start in `page` or `panel` view |
| `reducedMotion` | `false` (or the OS setting) | Hold animations at their end state, no autoplay |
| `chapters` | — | Per-chapter embed defaults `{ autoplay?, poster? }`, keyed by chapter id or uuid (see below) |
| `print` | `false` | Static print render: implies no cover, no toolbar, page view and reduced motion, and adds the class `pw-print` to `<html>` for a print stylesheet. The CMS PDF export prints every page this way. |

Start language, first match wins: `?locale=` (or `?lang=`) in the URL, the
config's `locale`, `meta.default_locale`. Matching accepts the language alone
(`?lang=de` → `de-DE`).

Start page: `?page=<page id>` (a manifest page id such as `pg-A3`) opens that
page in page view, without the cover.

### Chapter pages and chapter embeds

`?chapter=<chapter id or CMS chapter uuid>` locks the page to that chapter
(the shell's `chapterScope`): it starts at the chapter, never leaves it and
skips the work's cover unless `?cover=1`. More URL parameters: `autoplay`,
`toolbar`, `cover` (`1`/`0`), `spp` (seconds per panel). With
`?embed=1&origin=<host origin>` on http(s) the page also speaks the embed
protocol ([EMBED_PROTOCOL.md](EMBED_PROTOCOL.md)) — that is how the embed
loader `player/panelwave-embed.js` puts one chapter per iframe on a course
page ([MULTI_CHAPTER_EMBED.md](MULTI_CHAPTER_EMBED.md)). From `file://` the
bridge stays off.

The config may carry per-chapter defaults (the CMS export writes them from
the chapters' embed settings); the URL wins:

```json
{ "chapters": { "ch-2": { "autoplay": true, "poster": "assets/posters/ch-2.webp" } } }
```

The page title is whatever `index.html` says; if it still carries the
placeholder `PanelWave`, the tab is named after `meta.title`.

## What a package does not do

- **No paywall, no analytics.** Everything in the package is readable; there
  is no server to check entitlements or receive events. The CMS export
  removes `paywall` and `tracking` from the manifest.
- **No commercial fonts.** The 14 open-licensed balloon font families (SIL
  OFL) are included. Ames Pro (Purastik Graphics) is not: it falls back to Comic Neue
  unless you license it and add `@font-face` rules in `fonts/custom-fonts.css`.

## Building

```bash
npm run build:standalone              # builds the library, then the app → dist/standalone-package/
npm run build:standalone -- --skip-lib
npm run test:standalone-build         # unit tests of the build script's rules
```

The Angular build emits `<script type="module">` although the bundles contain
no `import`/`export`. Browsers refuse module scripts from `file://`, so
`scripts/build-standalone.mjs`:

- rewrites the tags to classic `defer` scripts under `player/`,
- wraps `main.js` and `polyfills.js` in a strict-mode IIFE — as classic
  scripts their top-level `var`s would otherwise become `window` properties
  and collide with built-ins such as `window.name` (which coerces to a string),
- **fails the build** if a bundle ever needs real module semantics (top-level
  `import`/`export`, `import.meta`, dynamic `import()`) or the build emits lazy
  chunks.

UI translations are bundled into `main.js` (`BundledTranslateLoader`), so the
page makes no request besides the work and its media.

## Tests

- Unit (Karma): `npx ng test standalone --watch=false --browsers=ChromeHeadless`
- E2E (Playwright): `e2e/standalone-package.spec.ts` builds packages into a
  temp folder and opens them from `file://` and from a static server
  sub-directory (needs `npm run build:standalone` first; skipped otherwise).
  Runs in chromium, firefox and webkit.
