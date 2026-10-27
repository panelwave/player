# Multi-chapter embeds — one player instance per chapter on a host page

Technical concept + implementation tracker. Status: **draft, 2026-10-27**.
Owner: player + CMS. Related: [EMBED_PROTOCOL.md](EMBED_PROTOCOL.md),
[STANDALONE.md](STANDALONE.md), [API.md](API.md),
`panelwave-cms/docs/PUBLISHING.md`, `panelwave-cms/docs/EXPORT_PLAYER_PACKAGE.md`.

## 1. Goal

Customers build **serious learning content** as one PanelWave work organised
into chapters. Their course page is a normal HTML page (text, images, video,
quizzes, …) with the PanelWave player embedded **several times — once per
chapter**, other content in between.

Requirements (from the request, 2026-10-27):

| # | Requirement |
|---|-------------|
| R1 | Several player instances on one host page, each showing a **different chapter of the same work**. |
| R2 | An instance can play **only its configured chapter** — no next/previous chapter, no TOC jump, no cross-chapter edge. |
| R3 | When the reader scrolls to an instance, the chapter **starts with autoplay or not — configurable per chapter**. |
| R4 | Instances after the first are **lazy-loaded** (no JS boot, no manifest/media fetch until the reader gets near). |
| R5 | **No schema change** if avoidable (checked in §3 — none needed). |

Non-goals for v1: SCORM/xAPI/LTI packaging, quiz authoring, cross-instance
state (variables shared between chapter embeds), several `<pw-player-shell>`
components inside **one** Angular application (see §4.2).

## 2. Where we stand today (facts)

Player (`@panelwave/player` 1.8.0, Angular 20):

- `PlayerShellComponent` has `initialChapterId`, `autoplay`, `secondsPerPanel`,
  `showCover`, `showToolbar` inputs
  (`projects/player/src/lib/components/player-shell/player-shell.component.ts:269-366`),
  but **nothing restricts navigation to a chapter**. Chapter order is the
  `manifest.chapters` array index (`adjacentChapter()`, shell:3217). Next at a
  chapter-end panel moves into the next chapter (shell:1717-1766), page view
  turns into adjacent chapters (`turnToAdjacentChapter`, shell:3250), TOC and
  thumbnail strip list every chapter, hotspot `goTo` / cross-chapter edges
  resolve the target's chapter (shell:1408). Autoplay runs **through** chapter
  ends and stops only at `atEndOfWork()` (shell:2830). Preload look-ahead
  spills into the next chapter (`updatePreloadTargets`, shell:3385).
- There is **no end-of-chapter / end-of-work screen**; `isEndOfWork()` only
  fires the `work_complete` analytics event (shell:1232).
- Autoplay has **no visibility gating**: no IntersectionObserver on the host
  element, no `visibilitychange`. Timers keep running when the player is
  scrolled away or the tab is hidden.
- **Every service is `providedIn: 'root'`** (manifest, player-state,
  variable-store, paywall, tracking, audio-engine, video-controller,
  video-sequencer, preload, image-cache, translation, …). Only
  `CanvasCameraService` is per shell. Two shells in one Angular app would share
  one manifest, one "current panel", one tracking session, one audio
  context, one UI language, one `window:keydown` handler (shell:2562) and the
  same `localStorage` keys. **Multiple shells per Angular app are not
  supported today** and making them so is a large refactor.
- The postMessage **embed bridge v1** exists only in the demo app
  (`projects/demo/src/app/embed-bridge.ts`, used by the CMS preview). Its
  `config` has no chapter key. The reader app (`projects/reader`) parses
  `embed` but ignores it; the standalone app has no bridge at all.
- No Web Component / `@angular/elements` build exists.
- Bundle: standalone `main.js` ≈ 770 KB (≈ 203 KB gzip). `build-standalone.mjs`
  **fails on lazy chunks** (file:// support), so "lazy loading" cannot mean
  Angular lazy chunks inside the player; it has to happen at the host-page
  level.

CMS (`panelwave-cms`, master):

- Manifest chapter ids are **`"ch-" & order_index`**
  (`ManifestBuilderService.cfc:1473`) — they change when chapters are
  reordered. `chapterId` (the DB UUID, a schema field) is stripped in
  export/player mode by `ManifestProfileService.dropInternalIds()` (:125-128).
  Instability is already a known issue (`docs/technical/OPEN_TASKS.md:247`).
- `chapters` table: `chapter_id, work_id, title_json, order_index,
  entry_panel_id, canvas, created_at, updated_at`. **No settings column.**
  `ChapterDAO.update()` accepts only title / entryPanelId / orderIndex / canvas.
  The editor has no chapter inspector; chapters are renamed/reordered in the
  structure tree only.
- The builder never emits `settings.ui.autoplayDefault` / `secondsPerPanel`;
  autoplay exists only as a preview control.
- Public reader (`apps/reader`, Node): routes `/{team}/{work}`,
  `/{team}/{work}/cover`, `/s/{token}`; reads `?embed=1`; injects
  `window.__PW_READER__ = {manifestUrl, embed, locale, title, mode}`
  (`render.ts:79-87`); sends `Content-Security-Policy: frame-ancestors *`
  (`pages.ts:57`). Public manifest + analytics ingest already answer with
  `Access-Control-Allow-Origin: *` (`Application.cfc:251-276`), so beacons
  from customer domains are accepted.
- Existing embed snippet UI: `shared/components/embed-snippet.component.ts`
  = one `<iframe src="{readerUrl}?embed=1" loading="lazy">` for the whole
  work (Publishing tab, Public target only).
- "Package with player (.zip)" (`worker-export/.../playerPackageGenerator.ts`)
  writes `panelwave.js` + `panelwave.config.json` with only `locale`,
  `showCover`, `showToolbar`; vendored `player-standalone` is **1.7.0 (stale)**.
  `?chapter=` deep links and a postMessage mode were explicitly deferred
  (`docs/improvements/player-package-export.md:310-315`).

## 3. Schema check — is a format change needed? **No.**

| Need | Where it lives | Schema impact |
|------|----------------|---------------|
| Which chapter an instance plays | **Embed configuration** (iframe URL / loader attribute), resolved against `chapters[].id` or `chapters[].chapterId` — both already in the schema. | none |
| Per-chapter autoplay flag | **Embed configuration**, authored in the CMS (new `chapters.embed_settings` DB column, §5.3) and emitted into the snippet / package config. It is a *presentation* setting of one embedding, not a property of the story, exactly like today's `autoplay` shell input and `settings.ui.autoplayDefault` (work level). | none |
| Lazy loading | Host page / loader behaviour. | none |
| Chapter restriction | Player runtime input. | none |

Checked and rejected:

- Putting `x-autoplay` on a chapter: `Chapter` is `additionalProperties:false`
  **without** a `^x-` pattern (`schema/1.0/panelwave.schema.json:1480-1532`;
  `^x-` is only allowed at the root, on `Panel` and in `ExtraBlock`). It
  would fail validation → *would* be a schema change. Not needed.
- A root-level `x-panelwave-embed` block: valid today, but hides embed
  settings in the story file and duplicates the CMS as source of truth.
  Rejected.
- Optional **future** minor (not part of this feature): `Chapter.embed`
  (`autoplay`, `poster`) so a hand-written manifest can carry defaults, and a
  `chapter_complete` entry in `tracking.eventWhitelist`. Both are additive
  and can wait until a second consumer needs them.

Consequence: chapter completion analytics stays derivable from existing
`panel_view` / `transition` events (last panel of chapter reached); no new
event type is required.

## 4. Architecture

### 4.1 Decision: one iframe per chapter, driven by a tiny host-page loader

```
customer-page.html
├── <script src="https://read.panelwave.org/embed.js" defer>      (≤ 6 KB, no deps)
├── …course text…
├── <div class="panelwave-embed" data-src="https://read.panelwave.org/acme/first-aid"
│        data-chapter="0d3a…-uuid" data-autoplay="true"  data-loading="eager">
├── …more text, a video…
├── <div class="panelwave-embed" data-src="…" data-chapter="7c1e…-uuid" data-autoplay="false">
└── <div class="panelwave-embed" data-src="…" data-chapter="b2f9…-uuid" data-autoplay="true">
```

Each `.panelwave-embed` becomes a responsive placeholder (poster + title +
play button). When it comes near the viewport the loader injects an
`<iframe>` whose URL carries the chapter and autoplay flags; the iframe runs
the **public reader app** (hosted) or the **standalone package page**
(self-hosted). Loader ↔ iframe talk via the existing embed bridge
(`pw:hello`, `pw:ready`, `pw:event`, `setOptions`, …), extended with chapter
scoping.

Why iframes:

- **Isolation for free.** Every iframe is its own Angular platform, so the
  root-singleton services, the global keyboard handler, the shared
  `AudioContext` and localStorage preferences do not collide (R1 without
  the §2 refactor).
- **Lazy loading is natural.** Nothing of the player loads until the loader
  creates the iframe (R4). Same-origin iframes share the browser HTTP cache,
  so `main.js`, fonts and the manifest are fetched once per page.
- **Works on any host stack** (plain HTML, WordPress, LMS "HTML block") and
  from any origin: the reader already sends `frame-ancestors *`, manifests and
  beacons already send wildcard CORS.
- Reuses what exists: reader app, standalone package, bridge v1, snippet UI.

Costs / mitigations: N iframes = N Angular boots (~770 KB JS parse each,
cached after the first). Loader keeps at most `data-max-live` (default 3)
iframes alive and unmounts far-away ones back to their poster (v1.1, §6.2).
Height is set by the loader from an aspect ratio (default from the work's
page format, override `data-aspect`), so there is no layout shift.

### 4.2 Alternatives considered

| Option | Verdict |
|--------|---------|
| Several `<pw-player-shell>` in one Angular app / a `@angular/elements` custom element | Needs ~20 services moved from `providedIn:'root'` to component-level providers, a focus-scoped keyboard handler, per-instance tracking sessions and localStorage namespacing. Months of risk for the player's main code path; the iframe design delivers R1–R4 without it. Keep as a long-term refactor (tracked, not scheduled). |
| One player instance that is moved/scrolled between chapter slots | Breaks the "content in between" layout, no parallel visible instances, fragile with host-page CSS. Rejected. |
| Server-sliced one-chapter manifests (`…/manifest?chapter=`) instead of a player-side restriction | Attractive for bandwidth, but it changes paywall reading order, `work_complete`, sequence-audio `span:'work'` tracks and dangling cross-chapter edges, and needs a CFML slicer kept in sync with the player. The full manifest is fetched **once** per page thanks to the HTTP cache, so slicing buys little. Keep as an optional optimisation (P5). |

### 4.3 Chapter reference stability (decision needed, recommendation given)

Snippets must survive chapter reordering, so they must not use `ch-N`.
**Recommendation:** keep `chapterId` (the UUID) in **player-mode** manifests
(stop deleting it in `dropInternalIds`; still delete `pageId`/panel internals)
and let the player accept a chapter by `id` **or** `chapterId`. The field is
already defined by the schema ("CMS database chapter UUID … not required by
the player"), is opaque, and also fixes the analytics `ch-N` → UUID remap
being order-dependent. Alternative: a public endpoint
`GET /public/read/{team}/{work}/chapters` that the reader server consults to
translate UUID → `ch-N` (one more request per embed; no manifest change).

## 5. Components and changes

### 5.1 Player library (`projects/player`) — v1.9.0

**A. Chapter scoping.** New input `chapterScope?: string` ("play only this
chapter"; matches `chapter.id` or `chapter.chapterId`). Effects, all behind
`this.chapterScope`:

| Place | Behaviour when scoped |
|-------|-----------------------|
| `initializePlayer` (shell:1075) | Start = scope chapter's `graph.entry` (or `initialPanelId` if inside the scope; a bookmark is resumed only if inside the scope). `initialChapterId` defaults to the scope. |
| `adjacentChapter()` (shell:3217) | returns `undefined` in both directions → `navigateNext`, `navigatePrevious`, `navigateToNextPage`, `turnToAdjacentChapter` stop at the scope boundary. |
| `navigateToPanel()` (shell:1408) | a target outside the scope is **blocked**: `navigationAttempt` fires with `{direction:'panel', target, blocked:'outside-scope'}`; no `error`. Applies to hotspot `goTo`, branch choices, cross-chapter edges, `navigate` bridge messages. |
| TOC / thumbnail strip (html:141, 207) | receive `[chapters]` filtered to the scope; the TOC hides the cover entry unless `showCover` and a cover exist. |
| `updatePreloadTargets()` (shell:3385) | no spill into the next chapter. |
| `isEndOfWork()` / `atEndOfWork()` (shell:1232, 2830) | treated as "end of scope": autoplay stops at the chapter end; `work_complete` is sent only if the scope is the last chapter of the work. |
| `isFirstChapter` (shell:3223) | the scope chapter counts as first (cover logic). Embeds pass `showCover=false` by default. |
| `FlowEngineService.findPath` / reachability | unchanged (pure graph helpers). |
| `PaywallService` | unchanged — a chapter-gated rule still shows the paywall overlay; work-gate rules still apply. |
| `SequenceAudioService` | `span:'work'` tracks that *started in an earlier chapter* are not started (documented limitation). |

Unknown scope id → `error` ("chapterScope … not found") and the error screen,
like a bad manifest.

**B. New output `chapterComplete`** `{ chapterId: string; panelId: string;
isLastChapter: boolean }` — fired once when the reader reaches a chapter-end
panel (`isChapterEndPanel`, `utils/reading-order.ts:49`) in any mode (not only
scoped). The loader uses it to stop autoplay re-arming and to show
"continue below"; hosts can use it for progress tracking.

**C. Visibility-gated autoplay.** New input `pauseAutoplayWhenHidden = true`:
the shell observes its host element (IntersectionObserver, threshold 0.5,
reuse `VisibilityService`) and `document.visibilitychange`; while hidden the
autoplay timer and video watchdog are suspended (not toggled off), and
re-armed on return. Pure player improvement, also fixes the "timers run in a
hidden tab" behaviour. `autoplay.spec.ts` must stay green (headless is
"visible").

**D. Embed bridge → library.** Move the protocol types and a reusable
host-side class from `projects/demo/src/app/embed-bridge.ts` into
`projects/player/src/lib/embed/` and export them (`EmbedBridgeMessages`,
`PlayerEmbedBridge` that wires a `PlayerShellComponent` to
`window.parent.postMessage`, with the `origin` allow-list rule from
EMBED_PROTOCOL.md). Protocol **v2 (backward compatible)**:

- `config.data` gains `chapterScope`, `showToolbar`; `setOptions` gains
  `showToolbar`.
- `pw:event` forwards the new `chapterComplete`; `pw:state.data` gains
  `chapterScope`, `chapterComplete: boolean`, `autoplayActive: boolean`.
- `pw:hello` reports `protocol: 2`.
- New inbound `{ type: 'hostGesture' }`: the loader forwards a click on the
  host page so the shell can retry policy-blocked audio once the iframe's
  `allow="autoplay"` delegation applies (`UserGestureService.markInteracted()`).

Demo, reader and standalone apps all use the library class (one
implementation instead of three).

**E. Reader app (`projects/reader`).** `__PW_READER__` gains `chapter`,
`autoplay`, `showToolbar`, `showCover`, `embedOrigin`, `secondsPerPanel`;
dev query fallback accepts the same as URL params. Template binds
`[chapterScope] [autoplay] [showToolbar] [showCover]`, starts the bridge when
`embed` is set. Address-bar sync (`history.replaceState`) stays on: it only
changes the iframe's own URL (never the host page's), so a reload inside the
iframe resumes the position, as for the existing whole-work embed. The embed
options are also read from the reader's own URL (`?chapter=&autoplay=&toolbar=&cover=&spp=&origin=`)
when the server does not inject them — display options only, safe in production.

**F. Standalone app (`projects/standalone`).** Query params `chapter`,
`autoplay`, `embed`, `origin`, `toolbar`, `cover`; `normalizeConfig` accepts
an optional `chapters: { [chapterIdOrUuid]: { autoplay?: boolean; poster?: string } }`
map (written by the CMS package export) used as defaults when the URL does not
say. Bridge active when `embed=1` on http(s); on `file://` the bridge is
disabled (opaque origins) — the package still works as a single page.

**G. Embed loader (`projects/embed-loader`, new).** Framework-free TypeScript,
built with esbuild to one IIFE `panelwave-embed.js` (target ≤ 6 KB min+gz,
ES2018). Shipped three ways: `dist/player/embed/panelwave-embed.js` inside the
npm package (ng-package `assets`), copied into the standalone package as
`player/panelwave-embed.js`, served by the reader server as
`https://read.panelwave.org/embed.js`.

Markup contract:

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `data-src` | required | Reader URL of the work (`https://read.panelwave.org/{team}/{slug}`) or the package page (`./course/index.html`). |
| `data-chapter` | required | `chapterId` UUID (preferred) or manifest `id`. |
| `data-autoplay` | `false` | Autoplay this chapter. The player plays only while at least half of it is on screen, pauses when it leaves, stops at the chapter's end (§6.1). |
| `data-loading` | `auto` | `eager` \| `lazy` \| `auto` (first instance on the page eager, the rest lazy) \| `click` (poster until tapped). Lazy uses IntersectionObserver with `rootMargin: 800px 0px`. |
| `data-poster` | — | Poster image URL for the placeholder (CMS fills it with the chapter's first panel thumbnail). |
| `data-title` | — | Placeholder caption + iframe `title` (a11y). |
| `data-aspect` | `16/9` | CSS aspect ratio of the box; CMS derives it from the work's page format. |
| `data-locale`, `data-toolbar` (`true`), `data-cover` (`false`), `data-seconds-per-panel` | — | Passed through as URL params. |
| `data-max-live` | `3` | v1.1: how many iframes stay mounted; farther ones return to the poster (state lost, acceptable for linear learning content; bookmark/variables persist via localStorage anyway). |

Loader behaviour:

1. On `DOMContentLoaded` (and `PanelWaveEmbed.scan()` for dynamically added
   nodes) each element gets `role="region"`, an aspect-ratio box, poster and
   a play button; `aria-busy` while loading.
2. Mount = create `<iframe src="{src}?embed=1&origin={encodeURIComponent(location.origin)}&chapter=…&autoplay=0|1&toolbar=…&cover=…&lang=…&spp=…" allow="autoplay; fullscreen" referrerpolicy="strict-origin-when-cross-origin" title="…">`. `data-autoplay` goes into the URL as is (R3): the player itself only plays while it is on screen (`pauseAutoplayWhenHidden`, an IntersectionObserver inside the iframe measures against the top-level viewport). **Implementation note (2026-10-27):** the first draft had the loader switch autoplay on and off over `setOptions`; with the in-player gating that is redundant, and the in-player way also works where no bridge runs (a package opened from `file://`) and can never fight the reader's toolbar.
3. Bridge: validate `event.origin === new URL(src).origin` (for same-origin
   package embeds this equals `location.origin`); on `pw:ready` remove the
   poster; forward `pw:event` as DOM `CustomEvent`s on the element
   (`panelwave:ready`, `panelwave:panelchange`, `panelwave:chaptercomplete`, …)
   so course pages / LMS glue can react without knowing the protocol.
4. Visibility: two shared IntersectionObservers — one with `rootMargin 800px`
   mounts lazy instances, one with thresholds 0…1 tracks which instances are
   at least half on screen (`data-exclusive-audio` mutes the others, and
   `data-max-live` never unmounts a visible one). A host-page
   `pointerdown`/`keydown` (capture, once) is forwarded as `hostGesture` to
   every mounted iframe (and to later ones on their `pw:hello`).
5. `data-loading=auto`: the first element in document order mounts at once,
   others when within `rootMargin`. `prefers-reduced-data` → behave as `click`.
6. Public JS API: `window.PanelWaveEmbed = { scan(root?), mount(el), unmount(el), get(el) → { navigate(panelId), setOptions(o), getState(): Promise<State>, destroy() }, version }`.

### 5.2 Public reader server (`panelwave-cms/apps/reader`)

- Routes: accept `?chapter=&autoplay=&toolbar=&cover=&origin=&locale=` on
  `/{team}/{work}` and `/s/{token}`; validate (`chapter`:
  `/^[A-Za-z0-9_.:-]{1,64}$/`, booleans as `0|1|true|false`). Inject into
  `__PW_READER__` (`render.ts`). Moved slugs keep the query (already so).
- Serve the loader at `/embed.js` (copied by `update-reader-app.ps1` from
  `dist/player/embed/`), `Cache-Control: public, max-age=3600`, CORS `*`.
- Keep `frame-ancestors *`. Skip Rybbit page analytics when `embed=1`
  (customer pages must not get third-party scripts they did not ask for).
- Analytics: pass `embed: true` and the host origin (`document.referrer`
  origin or `location.ancestorOrigins[0]`) into the player's tracking session
  context (`session_start` data `embedHost`), so the CMS can split "read on
  read.panelwave.org" from "embedded on customer.example".

### 5.3 CMS API (`apps/cms-api`)

- **Migration `111_chapter_embed_settings.sql`:**
  `ALTER TABLE chapters ADD COLUMN embed_settings jsonb NOT NULL DEFAULT '{}'::jsonb;`
  Shape: `{ "autoplay": boolean, "posterAssetId"?: uuid, "exclude"?: boolean }`
  (`exclude` = leave this chapter out of the generated snippet set).
- `ChapterDAO.update()` + `PATCH /chapters/{id}` accept `embedSettings`
  (validated keys only; send `{}` not null — Lucee drops null keys).
  `GET /works/{id}/chapters` returns it.
- `ManifestProfileService.dropInternalIds`: keep `chapterId` in player mode
  (decision §4.3). Update `MANIFEST_MODES.md` + the profile spec (§4.3 of the
  manifest-modes doc) accordingly. Analytics `AnalyticsService.cfc:1164`
  prefers the UUID when the event carries one.
- `WorkArchiveService` player sidecar: include `embedSettings` per chapter so
  the export worker can write `panelwave.config.json.chapters` and the
  example page (§5.5).
- New public endpoint **optional** (only if §4.3 alternative is chosen):
  `GET /public/read/{team}/{work}/chapters` → `[{ id, chapterId, title, poster }]`.

### 5.4 CMS frontend (`apps/cms-frontend`)

New **"Embed chapters"** builder in Work Properties → Publishing (next to the
existing reader-links / embed snippet panel), component
`features/publish/chapter-embed-builder/`:

- Source selector: **Hosted** (requires a current Public release; shows the
  reader URL) or **Self-hosted package** (free-text base path, default
  `./my-work/`; links to the export wizard).
- Chapter table (order from the structure): include ☐, **Autoplay on scroll**
  ☐ (persists to `embedSettings.autoplay` via `updateChapter`), poster
  (auto = first panel thumbnail, or pick via `AssetPickerService`), copy button
  per chapter.
- Page options (not persisted, snippet only): locale, toolbar, cover, loading
  strategy, aspect ratio (prefilled from the work's output formats), seconds
  per panel.
- Output: one `<script src=… defer>` line + one `<div class="panelwave-embed" …>`
  per included chapter, with copy-all, plus "Download example page (.html)".
- Live preview (nice-to-have): render the generated page into the existing
  preview `device-frame` iframe via `srcdoc`.

Help link via `DOCS_PAGES` → new docs-site page (§5.6).

### 5.5 Export "Package with player (.zip)" (`apps/worker-export`)

- `playerPackageGenerator.ts`: write `panelwave.config.json.chapters` from the
  sidecar's per-chapter `embedSettings`; emit `embed-example.html` (all
  included chapters, relative `data-src="./index.html"`, posters pointing at
  packaged thumbnails) and mention it in `README.txt`.
- `packageHosting.ts`: `.htaccess` / `_headers` get
  `Access-Control-Allow-Origin: *` for `panelwave.json` and `player/*` only
  when the new wizard option "allow embedding from other sites" is on (same
  site = no CORS needed).
- Export wizard (`export-types.ts`, `export-wizard.component.*`): new
  `PlayerPackageOpts.includeEmbedExample` (default true) and
  `allowCrossOriginEmbed` (default false).
- Re-vendor `player-standalone/` (currently 1.7.0) after the player release.

### 5.6 Docs & release

- Player repo: this file (keep the tracker current), `EMBED_PROTOCOL.md` (v2
  table), `STANDALONE.md` (query params, `chapters` config, embed-example),
  `API.md` (`chapterScope`, `chapterComplete`, `pauseAutoplayWhenHidden`),
  README feature list, `CHANGELOG.md` 1.9.0.
- Docs site (`panelwave-docs`): new `player/embed-chapters.mdx` (host-page
  recipe, attributes table, events, LMS notes), update
  `player/inputs-outputs.mdx`, `player/standalone-package.mdx`,
  `cms/publishing` (Embed chapters builder), `documentation.json`; squash
  before pushing (deploy takes only the last commit's pages).
- CMS docs: `PUBLISHING.md`, `PLAYER_EMBED.md` (bridge v2, three consumers),
  `EXPORT_PLAYER_PACKAGE.md`, `ANALYTICS.md` (`embedHost`), `MANIFEST_MODES.md`
  (`chapterId` kept), `apps/reader/README.md`.
- Website: a short "Embed chapters in your course page" paragraph on the
  features / education page (optional, marketing's call).

## 6. Behaviour details

### 6.1 Autoplay-on-scroll semantics

| Situation | Behaviour |
|-----------|-----------|
| Instance mounts (lazy or eager) | Player boots with `autoplay=1` (`data-autoplay`) or `0`; poster stays until `pw:ready`. Mounted ahead of the viewport, it is off screen, so its autoplay is suspended from the start. |
| ≥ 50 % visible (or half the viewport for a taller player), `data-autoplay=true` | The shell resumes autoplay; the first dwell starts now, not while off screen. |
| Drops below 50 % / tab hidden | The shell suspends autoplay on the current panel (timers cleared, autoplay stays on). |
| Back in view | Re-armed with a fresh dwell; a page-view video queue that finished meanwhile turns the page now. |
| Chapter end | `atEndOfWork` holds at the scope's end: autoplay switches itself off (`autoplayChange(false)`) and `chapterComplete` fires — nothing re-arms it. |
| Reader toggles autoplay off in the toolbar | Off stays off: nothing outside the player switches it back on. |
| `data-autoplay=false` | The reader taps / arrows through the chapter; turning autoplay on in the toolbar is still gated by visibility. |
| Sound | Autoplay here means *panel advance*. Audio/video with sound follow browser policy: the iframe gets `allow="autoplay"`, the loader forwards the first host-page gesture (`hostGesture`), the player's unmute affordance covers the rest. Document this for customers. |
| Tab hidden | shell suspends timers (`visibilitychange`). |
| `prefers-reduced-motion` | shell already forces reduced motion; autoplay is still allowed (reader expectation for a lesson), toolbar toggle available. |

### 6.2 Lazy loading

- `auto`: first instance eager so the page has content at once; others mount
  when within 800 px (one viewport ahead on desktop, roughly). Tunable per
  element via `data-loading`.
- Posters are plain `<img loading="lazy">`, so a 20-chapter page costs 20
  thumbnails, not 20 players.
- Same-origin iframes share the HTTP cache: `main.js`/`polyfills.js`/`styles.css`
  (`Cache-Control: public, max-age=3600` via the package host files; reader
  server sets long-lived hashed filenames), the manifest (`max-age=300` on
  `/public/read/*/manifest`) and media variants.
- v1.1 `data-max-live`: unmount the farthest iframe when more than N are
  mounted; re-mount restores from `graph.entry` (or the device bookmark if the
  reader left one — bookmarks are per work, so the restored instance checks
  the bookmark is inside its scope, else entry).
- Memory guard: the shell's `ImageCacheService` budget is per iframe
  (100 MB each!); lower it to 32 MB when `embed=1` + `chapterScope` is set.

### 6.3 Isolation checklist (why iframes make R1 cheap)

| Shared thing | Status with iframes |
|--------------|---------------------|
| Angular root services, current panel, manifest | one per iframe ✔ |
| `window:keydown` arrows / `t` / `o` | only the focused iframe receives keys ✔ (loader gives the iframe focus on click) |
| `AudioContext`, video "one unmuted at a time" | per iframe — two chapters could play audio at once; the loader pauses autoplay off-screen, and the shell's leave-fade handles the rest. **Open:** optional `data-exclusive-audio` (loader mutes others on `pw:event audio…`). |
| `localStorage` `pw-preferences`, `pw-social`, `pw-age-verified`, `pw-variables-persistent` | shared per **origin**, i.e. per reader host or package folder, exactly as the single-page reader today. Bookmark is per work (two chapter embeds share one bookmark; §6.2 handles the scope check). Age gate answered once applies to all chapters ✔ (desired). |
| Tracking session | one per iframe; `embedHost` dimension groups them. |

### 6.4 Edge cases

- **Cross-chapter edge or hotspot target** inside a scoped instance → blocked
  with `navigationAttempt{blocked:'outside-scope'}`; the CMS validator (publish
  pre-flight) warns "Chapter X links to chapter Y — in a chapter embed this
  link is inert".
- **Branch chooser** whose choices all leave the scope → chooser not shown,
  panel is a dead end → `chapterComplete`.
- **Paywalled chapter** → paywall overlay as today; `paywallAction` reaches
  the host as a DOM event, so the course page can route to its own checkout.
- **Page view works**: scope applies to pages too (`chapterPages()` is per
  chapter already); page turn stops at the scope boundary.
- **Canvas chapters**: canvas view is per chapter already; scope just removes
  the chapter jump.
- **Review / staging links** (`/s/{token}`): same params, so a client can
  review the course page before publishing.
- **Unknown `data-chapter`** → iframe shows the player error screen with the
  message; loader surfaces `panelwave:error`.

## 7. Open decisions

| # | Question | Recommendation |
|---|----------|----------------|
| D1 | Embedding technique | iframe per chapter + loader (§4.1). |
| D2 | Stable chapter reference | keep `chapterId` UUID in player manifests, accept id or UUID in `chapterScope` (§4.3). |
| D3 | Where per-chapter autoplay is stored | `chapters.embed_settings jsonb` (migration 111), edited in the Embed chapters builder; no schema change. |
| D4 | Loader distribution | player repo `projects/embed-loader`; npm asset, reader `/embed.js`, package `player/panelwave-embed.js`. |
| D5 | Autoplay off-screen | pause + resume inside the player (`pauseAutoplayWhenHidden`), never re-arm after the chapter's end, never override a manual toolbar off. Decided 2026-10-27 during implementation: in-player, not remote-controlled by the loader. |
| D6 | Default loading | `auto` (first eager, rest lazy, 800 px margin). |
| D7 | Rybbit on embedded reader pages | off when `embed=1`. |
| D8 | Several shells in one Angular app | out of scope; document as unsupported in API.md. |

## 8. Implementation tracker

Tick boxes as work lands (commit per block, conventional commits). Phases can
be worked in parallel by repo: P1 (player) is a prerequisite for P2–P4.

### P1 — Player library: chapter scope & visibility (player 1.9.0)

- [x] `chapterScope` input: resolve by `id` or `chapterId`; unknown → `error` + error screen
- [x] Start position inside the scope (`initializePlayer`); bookmark resume only when inside scope
- [x] `adjacentChapter()` returns `undefined` when scoped (next/prev/page turn/preload)
- [x] `navigateToPanel()` blocks outside-scope targets; `navigationAttempt` gains optional `blocked: 'outside-scope'`
- [x] TOC overlay + thumbnail strip receive scoped `chapters`; cover entry hidden unless cover shown
- [x] `isEndOfWork()`/`atEndOfWork()` → end of scope; `work_complete` only when scope is the last chapter
- [x] New output `chapterComplete` (`{chapterId, panelId, isLastChapter}`), fired once per chapter entry
- [x] `pauseAutoplayWhenHidden` input (IntersectionObserver on host + `visibilitychange`), default `true`
- [x] `ImageCacheService.setMemoryBudget(32 MB)` when scoped + embedded (or an `imageCacheBudgetMb` input)
- [x] Unit specs: scope navigation (panel/page/canvas), blocked targets, TOC filtering, preload no-spill, `chapterComplete`, visibility pause/resume
- [x] e2e: `e2e/chapter-scope.spec.ts` against the demo app with `?chapter=` (demo gets the param for testing)
- [x] `API.md`, README, CHANGELOG entries; `ng lint player` clean

### P2 — Embed bridge v2 in the library + apps

- [x] Move bridge types/helpers to `projects/player/src/lib/embed/`, export `PlayerEmbedBridge` + message types from `public-api.ts`
- [x] Protocol v2: `config.chapterScope`/`showToolbar`, `setOptions.showToolbar`, `pw:state` additions, `hostGesture`, `pw:hello protocol:2`
- [x] Demo app uses the library bridge (CMS preview unchanged in behaviour; `app.component.spec.ts` "embed bridge" green)
- [x] Reader app: read `chapter/autoplay/showToolbar/showCover/embedOrigin/secondsPerPanel` from `__PW_READER__` (+ URL fallback), bind inputs, start bridge when `embed` (address-bar sync stays: iframe-local)
- [x] Standalone app: query params `chapter/autoplay/embed/origin/toolbar/cover`, `config.chapters` map, bridge on http(s) only
- [x] `EMBED_PROTOCOL.md` → v2; `STANDALONE.md` updated
- [x] Specs: reader boot-config, standalone `boot.ts` (`normalizeConfig` with `chapters`), bridge class

### P3 — Embed loader (`projects/embed-loader`)

- [x] Project scaffold (TypeScript, esbuild script `scripts/build-embed-loader.mjs`, IIFE, size budget ≤ 6 KB gz, no deps)
- [x] Placeholder rendering (aspect box, poster, title, play button, `aria-busy`, focus handling)
- [x] Mount/unmount, URL building (`embed=1&origin=…&chapter=…&autoplay=0&…`), `allow="autoplay; fullscreen"`
- [x] Bridge client: origin check, `pw:ready` → remove poster, `pw:event` → DOM `CustomEvent`s, `getState()` promise
- [x] Visibility controller: shared IntersectionObservers (lazy mount at 800 px, ≥ 50 % visibility); autoplay start/pause/end-latch/manual-toggle handled in the player (`pauseAutoplayWhenHidden`, D5) with `data-autoplay` passed in the URL
- [x] Loading strategies `eager | lazy | auto | click`, `rootMargin 800px`, `prefers-reduced-data` → `click`
- [x] `hostGesture` forwarding (first pointerdown/keydown on host page)
- [x] `window.PanelWaveEmbed` API (`scan/mount/unmount/get/version`), MutationObserver-free (explicit `scan()` for SPAs)
- [x] v1.1: `data-max-live` unmount-to-poster; optional `data-exclusive-audio`
- [x] Unit tests (`node --test scripts/embed-loader.test.mjs`, core bundled by esbuild) for options, URL building, strategy selection, unmount choice
- [x] e2e `e2e/multi-chapter-embed.spec.ts`: course page with 3 chapters generated by the spec (host and package on two origins), asserts: only first iframe exists at load; 2nd mounts on scroll; autoplay starts only when visible and only where configured; pause when scrolled away; scope boundaries hold; keyboard only reaches the focused iframe; chromium + firefox + webkit
- [x] Ship: `dist/player/embed/panelwave-embed.js` via ng-package assets; `build-standalone.mjs` copies it into `player/`; `VERSION.json` lists loader version
- [x] README section + `docs/MULTI_CHAPTER_EMBED.md` (this file) kept current

### P4 — CMS: reader server, API, frontend, export

Reader server (`apps/reader`):
- [x] Parse/validate `chapter/autoplay/toolbar/cover/origin/locale/secondsPerPanel`; inject into `__PW_READER__`; tests in `routes.test.ts` / `render.test.ts`
- [x] Serve `/embed.js` (copied by `scripts/update-reader-app.ps1`), cache + CORS headers
- [x] Skip Rybbit when `embed=1`
- [x] `apps/reader/README.md`

API (`apps/cms-api`):
- [ ] Migration `111_chapter_embed_settings.sql` (`embed_settings jsonb NOT NULL DEFAULT '{}'`), apply on dev; prod via `scripts/migrate.sh` (hand to the user)
- [ ] `ChapterDAO.update()` + `PATCH /chapters/{id}` accept validated `embedSettings`; chapters GET returns it; TestBox specs
- [ ] `ManifestProfileService.dropInternalIds`: keep `chapterId` in player mode (D2); update `MANIFEST_MODES.md`; `AnalyticsService` chapter remap prefers UUID
- [ ] Tracking: accept `embedHost` in `session_start` data (ingest + aggregates in `worker-analytics`: new dimension "embedded vs reader")
- [ ] `WorkArchiveService` player sidecar includes per-chapter `embedSettings` + poster URLs
- [ ] Publish pre-flight warning: cross-chapter links are inert in chapter embeds
- [ ] `npm run test:api:chunked` (incl. `specs/integration/`) green; regenerate `API_REFERENCE.md`

Frontend (`apps/cms-frontend`):
- [ ] `Chapter` model + `api-client.service.ts` gain `embedSettings`
- [ ] `chapter-embed-builder` component in Publishing tab (source selector, chapter table with Autoplay toggle + poster, page options, snippet output, copy, download example page)
- [ ] Hosted mode gated on a current Public release (reuse `reader-links-panel` state)
- [ ] Help link (`DOCS_PAGES`) to the new docs page
- [ ] Unit specs (snippet generation is a pure function → test it exhaustively); Playwright smoke for the builder
- [ ] Optional: live preview via `srcdoc` in the preview device frame

Export (`apps/worker-export`):
- [ ] `PlayerPackageOptions.includeEmbedExample` / `allowCrossOriginEmbed`; wizard options + presets
- [ ] `panelwave.config.json.chapters` from sidecar `embedSettings`; `embed-example.html`; README.txt paragraph
- [ ] `packageHosting.ts`: optional CORS lines for `panelwave.json` + `player/*`
- [ ] Jest specs; `docs/EXPORT_PLAYER_PACKAGE.md`
- [ ] Re-vendor: `update-player-embed.ps1`, `update-player-standalone.ps1`, `update-reader-app.ps1` after the 1.9.0 player build (all three — PDF export uses the standalone copy)

### P5 — Docs, release, follow-ups

- [ ] Docs site: `player/embed-chapters.mdx` (+ `documentation.json`), updates to inputs-outputs / standalone-package / cms publishing; squash + push
- [ ] CMS docs: `PUBLISHING.md`, `PLAYER_EMBED.md`, `ANALYTICS.md`, `MANIFEST_MODES.md`
- [ ] Player release 1.9.0 via `release.yml` (no pre-bump); `@panelwave/types`/CLI untouched (no schema change)
- [ ] Prod: migration 111, deploy cms + reader + workers; verify `https://read.panelwave.org/embed.js` and one real customer-style page on a foreign origin (CORS, frame-ancestors, autoplay delegation)
- [ ] Analytics dashboard: "embedded" split (uses `embedHost`)
- [ ] Follow-ups (not scheduled): server-sliced one-chapter manifests; `Chapter.embed` + `chapter_complete` schema minor; multi-shell-per-app refactor; xAPI/SCORM wrapper for LMS customers (business plan Segment C)

## 9. Test plan (acceptance)

1. Fixture page with 3 chapters of a sample work (hosted via the demo's dev
   server and via a built package in a static sub-directory), opened on a
   different origin than the player.
2. Load: exactly one iframe exists; posters for the other two; no manifest
   fetch for them (network panel / Playwright request count).
3. Scroll to chapter 2 (autoplay on): iframe mounts at 800 px, poster
   disappears on `pw:ready`, autoplay starts only once ≥ 50 % visible; scrolling
   away pauses; returning resumes; reaching the last panel fires
   `panelwave:chaptercomplete` and autoplay does not restart.
4. Chapter 3 (autoplay off): mounts, waits for the reader.
5. In every instance: Next at the last panel does nothing, TOC lists one
   chapter, a cross-chapter hotspot is inert and emits the blocked attempt.
6. Keyboard arrows affect only the focused iframe; `t` toggles one toolbar.
7. Reorder chapters in the CMS → snippets still open the same chapters (UUID).
8. Package: `embed-example.html` opens from a static server; from `file://`
   `index.html` still works single-page.
9. Lighthouse on the fixture page: no layout shift from mounting (aspect
   boxes), total JS transferred ≈ one player bundle regardless of chapter
   count (cache).

## 10. Rollout

1. Player P1+P2+P3 on `feature/multi-chapter-embed` (player repo), release 1.9.0.
2. CMS P4 on `feature/multi-chapter-embed` (cms repo); vendor the 1.9.0 builds
   with all three scripts; migration 111 dev → prod.
3. Docs + website; announce to the requesting clients with the docs page and
   a sample course page.
