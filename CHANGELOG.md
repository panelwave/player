# Changelog

All notable changes to `@panelwave/player` are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
semver. The reader-facing product changelog lives on the docs site
(docs.panelwave.org → Changelog); this file tracks the library.

## [Unreleased]

### Added
- Reading position as a URL: page view and panel view get their own
  addresses (`?page=<pageId>`, `?panel=<panelId>`; none on the cover). New
  shell output `locationChange` (`PlayerLocation`), inputs `initialPageId`
  (a page of another format opens the page with the same panels) and
  `initialViewMode`; `initialPanelId` no longer needs `initialChapterId`.
  Exported helpers `parseLocationSearch` / `locationUrl`. The reader and the
  demo keep the address bar on the position (`history.replaceState`) and
  open a shared link there. The demo takes `?view=panel|page`.
- Share dialog: the link is the current address with the reading position
  (new input `shareUrl` overrides it; `embed` is dropped) and the work title.
  The QR code is drawn on the device as inline SVG (`uqr`, MIT, no
  dependencies) instead of an image from api.qrserver.com; nothing is sent
  to a third party.
- Language switch for translated works: the toolbar's languages are
  `meta.locales` plus every language the speech bubbles / text layers carry
  and the active `localization.locales` (works were often translated
  without `meta.locales` being updated, which hid the switch). A bare code
  (`en`) is not listed next to a regioned locale of its language (`en-US`).
- Toolbar: fullscreen button (Lucide maximize / minimize, the CMS icons)
  that shows the player in fullscreen and returns to the browser view; hidden
  where the browser has no fullscreen (iPhone Safari). "Made with PanelWave"
  credit linking to https://panelwave.org and a help icon linking to
  https://docs.panelwave.org/player/overview. New toolbar inputs
  `fullscreen` / `fullscreenAvailable`, output `toggleFullscreen`.
- Page view shows the previous / next arrows at the screen edges on hover,
  like panel view; they turn the page.
- Double-click a panel in page view to open it large in panel view; double-
  click in panel view to return to the page. New viewport output
  `panelDoubleClick`.
- Page-view video sequence holds for image panels: an image panel between
  two `on-view` videos pauses the sequence for its dwell time (`durationMs`
  from the CMS timeline, else the reader's seconds per panel). Video A 3 s,
  image B 2 s, image C 4 s, video D 6 s plays A, waits 6 s, plays D. Images
  before the first video delay it, images after the last one delay the
  autoplay page turn. `VideoSequencerService.start()` takes the page
  timeline (`PageTimelineEntry[]`).
- Hovering an `on-view` video in page view plays it while it is not playing
  (waiting for its turn, finished); leaving pauses it unless the sequence
  took it over. A click plays any video that is not playing.
- Demo and reader show the PanelWave icon in the browser tab (was Angular's)
  plus an Apple touch icon.
- Page view picks the page sequence by screen: a chapter carries one page
  sequence per output format, and the player shows the authored format that
  suits the screen (`bigscreen-landscape` on a 4K display, `mobile-portrait`
  on a phone, …), re-picking on resize. New input `pageFormat` forces one.
  The page box takes its format's aspect ratio and fills the screen (was a
  fixed 16:9 box of at most 1400 px for every format). Paging continues into
  the next / previous chapter.
- Cover: reading from the beginning opens on the work's cover (`meta.cover`,
  else `extras.cover`); next leaves it, previous on the first panel or page
  returns to it. It heads the thumbnail strip and the table of contents. New
  input `showCover` (default `true`).
- Autoplay plays each panel for its authored `durationMs` (page view: the sum
  over the page's panels). The toolbar marks the author's timing; picking a
  speed switches to the reader's seconds per panel, an "Author" button goes
  back. Autoplay stops at the end of the work.
- Thumbnail strip and table of contents show each panel's artwork (a small
  catalog rendition), in reading order; the strip separates chapters with a
  title card. Utilities `panelThumbnailSrc`, `coverImageSrc`,
  `pickPageFormat`, `pagesForFormat` and friends are exported.
- The button that opens the toolbar shows the PanelWave icon.
- Format 1.7 support: `x-` extension properties are typed on `Panel` and extras blocks (`ExtraItem`); empty graph edges follow reading order (see the reading-order entry below).
- Locked-panel placeholder for manifests that mark panels `"x-locked": true` (server-side paywall views).
- Page view: a locked panel's placeholder is a button (click, Enter, Space;
  label `player.locked.unlock`). Activating it raises the gate for that panel
  in place: the age gate when only the age is missing, otherwise the paywall
  with that panel's purchase / subscribe options. New viewport output
  `lockedPanelActivate` (panel id).

### Changed
- Start: a work opens on the cover, then in page view (when it has
  pages); a resumed bookmark opens on the cover too, with its page behind
  it (was: panel view, and no cover on a bookmark). Links open where they
  point, without the cover. `initialViewMode: 'panel'` keeps panel view.
- Toolbar: a solid bar with a clear top line (was a gradient fading into
  the artwork); the button row may use up to 1800 px (was 1400 px).
- Page background color: `page.visual.background_color` (else
  `settings.typography.default_page_bg_color`, else the previous `#1a1a1a`)
  fills the space between the panels in page view and the frame around the
  panel in panel view. Panel view takes the color of the page holding the
  current panel, so it switches when the first panel of the next page
  appears. The page box has no inset or rounded corners any more and the
  letterbox around it is painted in the page color, so the page runs edge to
  edge (was a 16 px light-grey `#f5f5f5` border plus grey letterbox). The
  panel-view panel box is transparent (was white with a shadow). New
  viewport input `pageBackground`, exported `resolvePageBackground` /
  `DEFAULT_PAGE_BACKGROUND` and type `PageVisual`.
- Balloon text is centered horizontally and vertically by layout (the text
  box spans the balloon body), not by the measured text height, which put
  the text off-center when the lettering font loaded after measuring. The
  measuring and rendered text share all styles (white-space, weight,
  letter-spacing pinned), so they wrap alike.
- Peer dependencies accept Angular 21 and 22: `@angular/core` and
  `@angular/common` are `^20.0.0 || ^21.0.0 || ^22.0.0` (was `^20.0.0`, which
  made npm refuse the install on newer apps). Verified with fresh Angular
  20.3 / 21.2 / 22.2 apps: strict-peer install, production build (the
  partial-compiled package links cleanly) and a headless render, zoneless and
  zone.js. No library code changes were needed.
- Peer dependency accepts ngx-translate 18: `@ngx-translate/core` is
  `^17.0.0 || ^18.0.0` (was `^17.0.0`, a conflict for hosts on the new
  `latest`). 18 removed `TranslateModule` and the `default*` aliases, so the
  components import the standalone `TranslatePipe` and `TranslationService`
  uses `setFallbackLang` / `getCurrentLang` / `getFallbackLang`, all of which
  exist in 17 too. Hosts on 18 must register ngx-translate with
  `provideTranslateService({ loader: { provide: TranslateLoader, useClass:
  ... } })`; the README setup now uses that form, which also works on 17
  (`provideTranslateLoader(SomeClass)` breaks 18 production builds for a
  plain class: its class detection fails on minified code). The consumer smoke
  test takes `--ngx-translate <major>` (default 18) and CI covers Angular
  20/21/22 on 18 plus 20 and 22 on 17.
- Package README: the usage example read `$event.panel.id` from
  `panelChange`, which does not compile (the player's `Panel` type has no
  `id`; panels are keyed by id in the manifest). It now reads the new
  `$event.panelId`. The setup section mentions `allowedCommonJsDependencies`
  for `json-logic-js`.

### Added
- `panelChange` carries the panel id: the payload (new exported type
  `PlayerPanelChangeEvent`) gains `panelId` (the panel's key in
  `chapter.panels`) and `previousPanelId` (the panel before it, possibly in
  the previous chapter; unset for the first panel after a load or reload).
  Additive: `panel` and `chapter` are unchanged, so existing handlers keep
  working. Hosts no longer need to look the id up by object identity.
- `npm run smoke:consumer -- --angular <major>` (`scripts/consumer-smoke.mjs`)
  and a CI matrix job running it for Angular 20, 21 and 22.
- Panel view honours `Panel.formatViews[format].minimalFocusRect`. A panel
  is shown at its natural size, centered — on a screen smaller than the panel
  (a landscape panel on a phone) that cropped it around its middle, whatever
  the author marked as important. The crop is now centered on the focus rect:
  the panel is shifted (never past its own edge) and shrinks only when the
  rect itself does not fit the screen. Of the formats a panel defines a focus
  rect for, the one whose frame is closest in aspect ratio to the viewport
  applies (the player has no active output format). Without a focus rect, or
  when the panel fits the screen, nothing changes. The rect is relative to the
  panel box, like speech bubbles and hotspots. Pure helpers `pickFocusRect` /
  `focusTransform` are exported from `utils/focus-rect-utils`.
- Format 1.6: layer keyframe animations. `Panel.animations.keyframes`
  (`AnimationKeyframe`: `layerId`, `property`, `timeMs`, `value`, optional
  `easing`) animate a layer's opacity, offset (`transform.x` / `transform.y`,
  fractions of the panel box), `transform.scale`, `transform.rotation`,
  `blur`, `brightness`, `contrast` and `saturate`; `loop` restarts the run.
  The animation starts when the panel is shown (panel view: it becomes the
  current panel; page and canvas view: at least a quarter of it is visible),
  a looping animation pauses off-screen, and reduced motion shows the end
  state without motion. Implemented by `PanelAnimationDirective` on the panel
  box (frame loop outside the Angular zone) on top of the pure helpers in
  `utils/keyframe-animation` (exported: `buildKeyframeTracks`, `sampleTrack`,
  `sampleKeyframes`, `layerAnimationStyles`, ...). New exported types
  `PanelAnimations`, `AnimationKeyframe`, `AnimatableProperty`,
  `AnimationEasing`; `Panel.animations` is typed.
- Camera moves. `Panel.animations.startViewportRect` / `endViewportRect` were
  part of the format since 1.0 but never rendered. The panel's artwork
  (layers, hotspots, speech bubbles) now pans and zooms inside the panel box
  from the start rect to the end rect over `durationMs`, eased by `easing`,
  on the same timeline as the layer keyframes (`loop` applies to both). A
  missing rect is the whole panel (only an end rect = push-in, only a start
  rect = pull-back); without a duration the end rect is shown as a static
  framing. The rect is fitted with a uniform scale and centered, and the
  artwork never leaves the box uncovered. Works in panel, page and canvas
  view. Pure helpers in `utils/camera-move` (exported: `cameraMoveRects`,
  `hasCameraMove`, `sampleViewportRect`, `viewportRectTransform`,
  `panelAnimationPlayTime`, ...).
- Autoplay waits for a panel's animation: in panel and canvas view the panel
  stays at least as long as a non-looping animation runs, so a dwell time
  shorter than the animation no longer cuts it off. Looping animations,
  reduced motion and page view keep the plain dwell time.
- Format 1.6: `extras.alt_cover` may be an array. Every alternative cover is
  listed in the extras viewer (an array was silently dropped before).
- Format 1.6: ensemble character sheets. A character sheet's `characterIds`
  (or the single `characterId`) are resolved to the characters' names and
  shown under the sheet's title in the extras viewer (`Extra.characters`).
- Format 1.6: `requiredProductIds` on a purchase paywall rule is now part of
  the schema (the player already honoured it). Owning any listed product
  unlocks the rule; the overlay offers one Buy option per product.
  `PaywallRule` type documents the field; README format table covers 1.5/1.6.
- Format 1.6: `paywall.products` (`PaywallProduct`: id, localized name /
  description, price, type). Buy / Subscribe options take their label,
  description and price from the entry with the option's id, resolved in the
  reader's locale; without one they fall back to the rule's name (single
  option) or the id (several), and the rule's description / price.
  `PaywallService.gateFor(panelId, locale?)`, `purchaseOptions(rule, products?,
  locale?, fallbackLocale?)`, `productsFromManifest()`; `PaywallProduct`
  type exported.
- The shell reacts to input changes after init: a new `manifest` /
  `manifestUrl` reloads the work (story state reset); `locale`,
  `entitlementSnapshot` (gates re-evaluated), `viewModeOverride`,
  `showToolbar`, `reducedMotion`, `secondsPerPanel` and `autoplay` apply
  live. `reload()` is public (the error screen's Retry uses it).
- Paywall overlay Buy / Subscribe options derived from the blocking rule
  (products, tiers, name, description, price); `paywallAction` emits
  `'subscribe'` and carries `productId`. `PaywallGate` gains `ruleId`,
  `lockReason` and `options`; `PaywallService.purchaseOptions()`,
  `isExtraLocked()`; evaluator exports `isExtraLocked`,
  `chapterOrderFromManifest`.
- Chapter-scoped paywall rules (`scope: "chapter"`, `refId`): gate only that
  chapter's panels, free preview counted within the chapter.
- Age gate, branch chooser and paywall reason are translated (`age_gate.*`,
  `branch_chooser.*`, `paywall.reason_*` in en/de); month names via `Intl`.
- Demo: `?byUrl=1` passes the manifest to the shell as `manifestUrl`.
- Age gate: `age_gate` paywall rules now raise `pw-age-gate` (birth-date
  check) instead of the purchase overlay. A pass is persisted on the device,
  folded into the entitlement snapshot and the interrupted navigation resumes.
  New output `ageVerified`.
- Like and Bookmark toolbar actions: persisted per work on the device, tracked
  (`like`, `bookmark` events), emitted as `likeChange` / `bookmarkChange`. A
  bookmark is resumed on the next load when the host gives no initial position.
- Choices: the toolbar shows the button when at least two outgoing edges of
  the current panel are open (conditions evaluated); `pw-branch-chooser` lists the edges whose conditions pass
  and traverses the chosen one (transition, camera move, mutations). Tracked as
  `branch_choice`.
- `CONTRIBUTING.md`, `docs/API.md`, GitHub Actions workflows (CI, release,
  demo pages, size limit).
- Hotspots are interactive in the canvas view (keyboard-activatable too).
- Extras viewer shows the blocks' real media.
- The current panel's art loads eagerly with `fetchpriority="high"`.
- Demo app: manifest selector (URL / local file), responsive device frames,
  dev-tools drawer with live metrics and a layer debug overlay.

### Changed
- `PurchaseInfo.price` is optional (rules without a price still offer Buy /
  Subscribe).
- Sign in stays visible next to purchase options on the paywall overlay.
- Extras-scoped paywall rules no longer gate panels (they were mapped onto a
  work gate and locked the whole work); they lock their extras block.
- A new `entitlementSnapshot` / `refreshEntitlements()` keeps an age
  verification the reader already passed on the device.
- Canvas-view edge taps apply the edge's `action` mutations.
- The speech-balloon engine (`comic-balloon.ts`, `balloon-geometry.ts`) is
  synced from the CMS editor, which is its master copy; do not edit the
  player files by hand (they carry a banner).
- Toolbar, comments and paywall texts are translated (were English-only).

### Fixed
- Autoplay no longer stalls on video panels: when a video's pass ended, the
  next panel was selected but not painted (OnPush), so it showed late or not
  at all. Every navigation now marks the view for check, also the autoplay
  progress bar.
- Preloading warms the art the reader sees next: the next panels in reading
  order (also into the next chapter) or the next pages' panels, at the
  rendition each will mount with, and the first panel while the cover is up.
  Images are warmed through decoded `Image` elements (same request as the
  `<img>`), not `fetch()` + `ImageBitmap`, which the `<img>` never reused
  and which failed outright on storage without CORS headers.
- Page view: a thumbnail or TOC entry opens the page that shows the panel
  (nothing happened before).
- The TOC lists only the pages of the format on screen (it listed every
  format's pages).
- Extras exported with a direct `url` only (as the CMS does) show that image
  as their thumbnail.
- Player chrome uses the UI font (Barlow, as in the CMS, overridable with
  `--pw-font-ui`): form controls now inherit it instead of the system font.
  Share buttons have a light text color (the 𝕏 glyph rendered black).
- `PreloadService` no longer preloads the assets of a panel the paywall locks
  for the reader (neighbour warming in panel and canvas view fetched gated
  artwork ahead of the gate). Items of panel ids the paywall does not know,
  or without a panel id, load as before.
- Panel audio of a gated panel no longer plays under the gate. The shell
  synced the current panel's `audio` tracks whatever its lock state, so an
  age-gated or paid entry panel played its music behind the age gate /
  paywall. A panel the renderers lock (rules, or an `x-locked` stub) now
  syncs with no panel; the audio starts once the lock lifts (age confirmed,
  purchase completed).
- Age requirements combine across every paywall rule that applies to a
  panel (its panel rules, its chapter's rules, every work rule, each outside
  its own free preview). The first matching rule decided everything, so a
  chapter rule's free preview or a panel-scoped `free` rule unlocked panels
  of a work behind a work-wide age gate without asking for the age. The
  commercial part keeps its precedence (panel > chapter > work). When several
  age rules are unmet, the gate names the highest minimum age.
- The entry panel is gated on the initial load and on chapter jumps. Only
  panel-to-panel moves checked the paywall, so a work or chapter whose first
  panel was gated (e.g. a work-wide age gate without a preview) was shown
  straight away. Now the initial load places the reader on the entry with
  the age gate (age requirement) or the paywall open over the locked
  placeholder; confirming the age reveals it in place. A chapter jump (TOC)
  into a gated entry stops like any other move: the gate opens and the
  reader stays put. A resumed bookmark / `initialPanelId` on a gated panel
  behaves like the initial load. In page view, turning onto (or switching
  to) a page with age-locked panels asks for the age once; confirming
  unlocks them in place.
- Page view and canvas view no longer render gated panels. The paywall was
  only checked when navigating panel by panel, so a page (or a revealed
  canvas panel) showed the content of panels the reader had not paid for or
  confirmed their age for. Viewport and canvas stage now show the locked
  placeholder for any panel `PaywallService.isPanelLocked(panelId)` reports
  (new: the evaluation for the current snapshot, memoized per rules +
  snapshot), plus `x-locked` stubs as before, and repaint on the new
  `PaywallService.changes$`. While a host `entitlementAdapter` decides
  access (`setEnforced(false)`, set by the shell), rules do not lock
  rendering. Works without rules are unaffected.
- Chapters without graph edges are readable: next/previous follow the
  chapter's reading order (entry, then `chapter.panels` key order) instead of
  stopping on the entry panel, and `work_complete` fires only on the last
  panel. Chapters with edges keep graph semantics. New
  `FlowEngineService.getNextInChapter` / `getPreviousInChapter`; the
  reading order lives in `utils/reading-order`.
- `PaywallService` treats a panel marked `"x-locked": true` as locked
  even when no rule gates it (or the reader satisfies the rule, or it sits in
  a free preview): the server stripped its content, so nothing could be shown.
  The gate keeps the applying rule's reason while that rule locks, else
  subscription/purchase required — never the age, so a confirmed age does
  not re-open the age gate on a stub. `isFreeWork` is false when the
  manifest has locked panels.
- Panel animations are clipped by the panel box. In panel view a layer that
  slid in from outside the panel (or any layer moved across its edge) was
  painted over the panel's surroundings; the box now clips its content while
  an animation is attached.
- A layer keeps its own opacity while other properties of it are animated.
  Animating only a layer's offset or scale reset its manifest `opacity` to
  fully opaque; the same happened when an animation was detached.
- The outgoing panel of a transition holds the end state of its animation
  instead of snapping back to the resting state while it leaves.
- `ageGate` / `minimumAge` is an age check on top of the rule's entitlement
  (schema semantics): a rule with a custom `requireEntitlement` marker (or
  `premium`) plus an age no longer degrades to a pure age gate, and purchase /
  subscription rules with an age require both. The reader is asked for the age
  first; once it passes, the paywall offers the Buy / Subscribe options. Only a
  rule with no entitlement and an age is a pure age gate. `scope: "global"`
  (not in the schema) is still read as an alias of `work`.
- ToC and thumbnail strip were empty when the work was loaded via
  `manifestUrl`.
- The `autoplay` input was never applied.
- Edge mutations were applied before the paywall check, so a blocked move
  still changed variables (counters grew with every attempt).
- Arrow keys, `T` and swipes moved the story behind an open paywall or age
  gate; arrow keys in the age gate's selects reached the story.
- The Choices button showed with fewer than two open paths (edge conditions
  were not evaluated).
- Retry on the error screen re-ran `ngOnInit` and duplicated subscriptions.
- Plugin host: only messages from the plugin's own frame and origin are
  trusted; per-plugin waits, retry after a failed load, cleanup on dispose.
- `panelChange` is emitted once per navigation (was twice).
- Transitions honour the OS and in-player reduced-motion settings.
- Modal/overlay bugs found by the new unit specs: the settings modal edits a
  working copy and Escape cancels; share emits `native`; the TOC reacts to
  input changes and Enter fires once; the thumbnail strip auto-scrolls to the
  current panel; the age gate validates real calendar dates; the extras
  "Other" filter works.
- Balloon geometry: `curveAmount: 0` is respected, `maxWidth: 0` means
  natural width, the bottom cut is clamped.
- Edge `action` mutations are applied on ordinary next-navigation (the flow
  engine returned them, the shell dropped them).
- `manifestUrl` input: `loadManifestFromUrl` no longer throws "not implemented".
- Lint: 204 problems → 0. Keyboard and focus handling on every backdrop and
  clickable container; typed `NavigationResult.action` (`Mutation[]`),
  `requestIdleCallback` / `NetworkInformation` usage, no `any` in library code.

### Tests
- Unit coverage 63 % → 80 %; axe accessibility sweep over every modal,
  overlay and view; heap-stability and frame-rate guards; E2E for speech,
  audio/SFX toggles, thumbnails, table of contents and persisted settings.

## [1.0.0] — unreleased on npm

Feature-complete player through Phase 6 of the development plan: graph-based
navigation with conditional edges, panel and page views, infinite-canvas view
(format 1.4), video panels (1.1), panel variants, hotspots (all five actions),
speech bubbles with the ComicBalloon renderer (9 balloon types), style presets
(1.3), localized strings and assets, variables in five scopes, panel audio with
Audio/SFX/Speech toggles, manifest paywall rules with the paywall overlay,
tracking with consent and whitelist, plugin sandbox, PDF/EDL/JSON export
helpers.
