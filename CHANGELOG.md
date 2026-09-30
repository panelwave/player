# Changelog

All notable changes to `@panelwave/player` are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
semver. The reader-facing product changelog lives on the docs site
(docs.panelwave.org → Changelog); this file tracks the library.

## [Unreleased]

### Changed
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
  `AnimationEasing`; `Panel.animations` is typed. The camera-move fields
  (`startViewportRect` / `endViewportRect`) are still not rendered.
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
