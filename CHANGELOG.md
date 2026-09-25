# Changelog

All notable changes to `@panelwave/player` are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
semver. The reader-facing product changelog lives on the docs site
(docs.panelwave.org → Changelog); this file tracks the library.

## [Unreleased]

### Added
- Age gate: `age_gate` paywall rules now raise `pw-age-gate` (birth-date
  check) instead of the purchase overlay. A pass is persisted on the device,
  folded into the entitlement snapshot and the interrupted navigation resumes.
  New output `ageVerified`.
- Like and Bookmark toolbar actions: persisted per work on the device, tracked
  (`like`, `bookmark` events), emitted as `likeChange` / `bookmarkChange`. A
  bookmark is resumed on the next load when the host gives no initial position.
- Choices: the toolbar shows the button when the current panel has more than
  one outgoing edge; `pw-branch-chooser` lists the edges whose conditions pass
  and traverses the chosen one (transition, camera move, mutations). Tracked as
  `branch_choice`.
- `CONTRIBUTING.md`, `docs/API.md`, GitHub Actions workflows (CI, release,
  demo pages, size limit).

### Fixed
- Edge `action` mutations are applied on ordinary next-navigation (the flow
  engine returned them, the shell dropped them).
- `manifestUrl` input: `loadManifestFromUrl` no longer throws "not implemented".
- Lint: 204 problems → 0. Keyboard and focus handling on every backdrop and
  clickable container; typed `NavigationResult.action` (`Mutation[]`),
  `requestIdleCallback` / `NetworkInformation` usage, no `any` in library code.

## [1.0.0] — unreleased on npm

Feature-complete player through Phase 6 of the development plan: graph-based
navigation with conditional edges, panel and page views, infinite-canvas view
(format 1.4), video panels (1.1), panel variants, hotspots (all five actions),
speech bubbles with the ComicBalloon renderer (9 balloon types), style presets
(1.3), localized strings and assets, variables in five scopes, panel audio with
Audio/SFX/Speech toggles, manifest paywall rules with the paywall overlay,
tracking with consent and whitelist, plugin sandbox, PDF/EDL/JSON export
helpers.
