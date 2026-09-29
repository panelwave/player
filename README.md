# PanelWave Player

**Open-source Angular library** for rendering interactive graphic novels in the PanelWave JSON format. High-performance, accessible, and extensible player with graph-based navigation, multilingual support, and plugin system.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-20%20%7C%2021%20%7C%2022-red)](https://angular.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![npm](https://img.shields.io/npm/v/@panelwave/player.svg)](https://www.npmjs.com/package/@panelwave/player)
[![ci](https://github.com/panelwave/player/actions/workflows/ci.yml/badge.svg)](https://github.com/panelwave/player/actions/workflows/ci.yml)

> **Documentation:** [docs.panelwave.org/player/overview](https://docs.panelwave.org/player/overview) · **Live demo:** [panelwave.github.io/player](https://panelwave.github.io/player/) · **npm:** [@panelwave/player](https://www.npmjs.com/package/@panelwave/player)

---

## 🎯 Overview

PanelWave Player is an **Angular library (20, 21 and 22)** that renders interactive graphic novels using the open **PanelWave JSON format**. It provides a complete, production-ready player with advanced features:

- **📖 Graph-Based Navigation** - Non-linear storytelling with conditional branching
- **🗺️ Two View Modes** - Classic panel view and an **infinite-canvas view** with camera pan/zoom (`CanvasStageComponent`, format 1.4)
- **🎞️ Video Panels** - Sequenced video layers with per-work/per-panel playback config (format 1.1)
- **🌍 Multilingual Support** - Runtime language switching with localized assets
- **♿ Accessibility First** - WCAG 2.1 AA compliance, keyboard navigation, screen reader support
- **🎮 Interactive Layers** - Hotspots, speech bubbles (9 balloon types with SVG rendering), variants, parallax effects
- **🔌 Plugin System** - Sandboxed plugin layers with a host message bus (360° viewer, mega-zoom, mini-games)
- **💰 Monetization Ready** - Paywall adapter interface for entitlement checks
- **🎨 Media Rich** - Image caching (responsive variant ladder), WebAudio mixing, video playback, preloading
- **📊 Analytics** - Tracking service with event hooks

---

## 🚀 Quick Start

### Installation

```bash
npm install @panelwave/player @ngx-translate/core
```

**Compatibility:** Angular **20, 21 and 22** (`@angular/core` / `@angular/common`
peer range `^20.0.0 || ^21.0.0 || ^22.0.0`), `@ngx-translate/core` ^17, `rxjs` ^7.8.
The library is built with Angular 20 in partial-compilation mode and linked by
the host's Angular version; CI proves each supported major with a consumer smoke
test (`npm run smoke:consumer -- --angular <major>`, see
[CONTRIBUTING.md](CONTRIBUTING.md)). Zone.js and zoneless apps both work.

### Basic Usage

```typescript
import { Component } from '@angular/core';
import { PlayerShellComponent } from '@panelwave/player';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PlayerShellComponent],
  template: `<pw-player-shell [manifestUrl]="manifestUrl"></pw-player-shell>`
})
export class AppComponent {
  manifestUrl = 'assets/my-story/panelwave.json';
}
```

### With Options

All configuration is passed as individual inputs on the shell component (see [Component API](#-component-api) for the full list):

```html
<pw-player-shell
  [manifestUrl]="url"
  locale="de-DE"
  initialChapterId="chapter-1"
  [autoplay]="false"
  [showToolbar]="true"
  viewModeOverride="canvas"
  (ready)="onReady()"
  (panelChange)="onPanelChange($event)"
  (error)="onError($event)">
</pw-player-shell>
```

---

## 🎨 Key Features

### ✅ Core Navigation
- **Graph-Based Flow** - Panels connected by edges with conditions
- **Edge Transitions** - Per-edge transitions rendered in panel view, with inheritance from work-level `outputPresets.defaultTransition` (format 1.2)
- **Decision Trees** - JSON Logic for branching narratives
- **Variables** - 5 scopes (global, chapter, page, session, persistent)
- **History Navigation** - Back/forward with state preservation
- **Keyboard Shortcuts** - Arrow keys, spacebar, hotkeys

### ✅ View Modes
- **Panel View** - Classic one-panel-at-a-time reading with transitions
- **Canvas View** - Infinite-canvas spatial mode (format 1.4): panels placed on a 2D stage, camera pan/zoom via `CanvasCameraService`, panel budget culling; select per work/chapter or force via the `viewModeOverride` input

### ✅ Content & Media
- **Layer System** - Image, video, text, audio, plugin layers
- **Video Panels** - Sequenced multi-video playback (`VideoSequencerService`) with per-work/per-panel playback defaults (play mode, start mode, muted; format 1.1)
- **Speech Bubbles** - Comic-book balloon rendering (normal, thought, shout, whisper, connector, cut-top variants) with configurable tails, hide-border effects, and per-character/per-bubble style overrides
- **Style Presets** - Work-level `settings.typography.textStyles` / `balloonPresets` referenced via `styleRef` on text layers and speech bubbles (format 1.3)
- **Hotspots** - Interactive areas (rect, circle, polygon; normalized panel-relative geometry) with all five manifest actions: `goTo` (mutations + transition), `setVariables`, `openExtras` (opens the viewer at the item), `openModal` (localized title/content dialog), `pluginEvent`. Conditional visibility via `visibleIf` (JSON Logic), localized labels/ariaLabels, keyboard activation (Tab + Enter/Space at the shape centroid). Every click is tracked as `hotspot_click {panelId, chapterId, hotspotId?, x, y, hit}` — clicks that miss all hotspots are recorded with `hit: false` (dead clicks) for the CMS click heatmap. Rendered in panel and page views; render-only in canvas view (taps keep edge navigation)
- **Variants** - Conditional content based on variables/entitlements
- **Preloading** - Intelligent lookahead with configurable distance
- **Image Cache** - LRU cache with memory budget management
- **Responsive Images** - Selects the best fit from the manifest's variant ladder (e.g. `w640`–`w2560`) per display size
- **Audio Engine** - WebAudio mixer with 4 channels (ambient, music, voiceover, SFX)
- **Video Controller** - Single active video policy with state management

### ✅ Internationalization
- **Multilingual** - Localized strings with fallback chains
- **Asset Localization** - Per-locale images, audio, video, subtitles
- **Runtime Switching** - Change language without reload
- **RTL Support** - Right-to-left language support

### ✅ Accessibility
- **Keyboard Navigation** - Full keyboard control (arrows, tab, shortcuts)
- **Screen Reader** - ARIA labels, live regions, announcements
- **Focus Management** - Trap focus in modals, restore on close
- **Reduced Motion** - Respect `prefers-reduced-motion`
- **High Contrast** - Support for high contrast mode
- **Content Warnings** - Blur overlays with dismiss option
- **Age Gates** - Age verification before mature content

### ✅ Monetization & Analytics
- **Paywall System** - Work, chapter, panel-level entitlement checks
- **Entitlement Adapter** - Interface for custom subscription systems
- **Preview Mode** - Blurred/low-res preview for gated content
- **Tracking Service** - Analytics events (panel viewed, choice made, etc.)
- **Progress Tracking** - Resume from last position

### ✅ Plugin System
- **Plugin API** - Register custom components for plugin layers
- **Sandboxed Execution** - Isolated plugin context
- **Event Communication** - Plugin-to-player message bus
- **Sample Plugins** - 360° viewer, mega-zoom, mini-games

---

## 📁 Project Structure

```
panelwave-player/
├── projects/
│   ├── player/                    # Main library (@panelwave/player)
│   │   └── src/lib/
│   │       ├── types/             # TypeScript interfaces (11 files)
│   │       │   ├── manifest.types.ts
│   │       │   ├── panel.types.ts
│   │       │   ├── asset.types.ts
│   │       │   ├── graph.types.ts
│   │       │   ├── variable.types.ts
│   │       │   ├── variant.types.ts
│   │       │   ├── canvas.types.ts       # Infinite-canvas view (format 1.4)
│   │       │   ├── player.types.ts
│   │       │   ├── plugin.types.ts
│   │       │   ├── export.types.ts
│   │       │   └── entitlement.types.ts
│   │       │
│   │       ├── services/          # Core services (18 services)
│   │       │   ├── player-state.service.ts
│   │       │   ├── manifest.service.ts
│   │       │   ├── variable-store.service.ts
│   │       │   ├── flow-engine.service.ts
│   │       │   ├── variant.service.ts
│   │       │   ├── image-cache.service.ts
│   │       │   ├── audio-engine.service.ts
│   │       │   ├── video-controller.service.ts
│   │       │   ├── video-sequencer.service.ts   # Sequenced video panels
│   │       │   ├── canvas-camera.service.ts     # Canvas-view camera
│   │       │   ├── user-gesture.service.ts
│   │       │   ├── visibility.service.ts
│   │       │   ├── preload.service.ts
│   │       │   ├── tracking.service.ts
│   │       │   ├── entitlement.service.ts
│   │       │   ├── plugin-host.service.ts
│   │       │   ├── export.service.ts
│   │       │   └── translation.service.ts
│   │       │
│   │       ├── state/             # Internal state store
│   │       │
│   │       ├── components/        # UI components (30+ components)
│   │       │   ├── player-shell/     # Main container (pw-player-shell)
│   │       │   ├── viewport/         # Panel-view renderer
│   │       │   ├── canvas-stage/     # Infinite-canvas renderer
│   │       │   ├── layer-renderer/   # Shared layer rendering
│   │       │   ├── layers/           # Image, video, text, plugin layers
│   │       │   ├── overlays/         # Hotspots, speech bubbles, paywall, age gate, …
│   │       │   ├── toolbar/          # Bottom controls
│   │       │   ├── modals/           # Settings, ToC, language, share, extras, …
│   │       │   ├── icon/             # Inline Lucide SVG icons (pw-icon)
│   │       │   ├── plugin-sandbox/   # Sandboxed plugin host
│   │       │   ├── variant-selector/ # Variant picker
│   │       │   └── helpers/          # Shared UI elements
│   │       │
│   │       └── utils/             # Helper functions
│   │           ├── locale-utils.ts
│   │           ├── asset-utils.ts
│   │           ├── json-logic-utils.ts
│   │           ├── animation-utils.ts
│   │           ├── comic-balloon.ts        # SVG balloon renderer
│   │           ├── balloon-config.ts       # Balloon config cascade
│   │           ├── video-config-utils.ts   # Video playback defaults
│   │           ├── image-variant-utils.ts  # Responsive variant selection
│   │           └── translation-loader.ts
│   │
│   └── demo/                      # Demo application
│       └── src/
│           └── assets/            # Sample manifests
│
├── docs/
│   └── BALLOON_RENDERER_SYNC.md  # Keeping ComicBalloon in sync with the CMS
│
├── .editorconfig
├── .prettierrc
├── eslint.config.js
├── angular.json
├── package.json
└── tsconfig.json
```

---

## 🛠️ Technology Stack

### Core
- **Framework:** built with Angular 20 (standalone components); runs on Angular 20, 21 and 22
- **Language:** TypeScript 5.8+ (strict mode)
- **State Management:** RxJS BehaviorSubjects
- **Logic Engine:** json-logic-js (condition evaluation)
- **Icons:** inlined [Lucide](https://lucide.dev) SVGs (ISC) via the `pw-icon` component — **no icon-library dependency**

### Media
- **Audio:** WebAudio API
- **Video:** HTMLVideoElement
- **Images:** createImageBitmap, LRU caching
- **Animations:** CSS3 transforms and transitions

### Internationalization
- **Library:** @ngx-translate/core
- **Loader:** @ngx-translate/http-loader

### Development
- **Build:** ng-packagr (library packaging)
- **Testing:** Jasmine (unit), Karma (runner)
- **Linting:** ESLint with Angular rules
- **Formatting:** Prettier

---

## 🪶 Icons

All UI-chrome icons render through a tiny, **dependency-free** inline-SVG component — the player does **not** pull in an icon library, so embedding it adds no extra runtime dependencies (there are no emoji in the UI).

- **Component:** [`PwIconComponent`](projects/player/src/lib/components/icon/pw-icon.component.ts) (selector `pw-icon`, exported from the public API). Glyphs use `stroke="currentColor"` and are sized to `1em`, so they inherit colour and size from the surrounding text and stay vertically centred (no clipping in flex rows).
- **Source:** the SVG markup lives in [`pw-icon.data.ts`](projects/player/src/lib/components/icon/pw-icon.data.ts). Icons are from [Lucide](https://lucide.dev) (ISC License) and inlined — only the glyphs the player UI actually uses are bundled.
- **Usage:** add `PwIconComponent` to a standalone component's `imports`, then `<pw-icon name="lucideSettings" />` (or `[name]="expr"` for dynamic/data-driven icons).
- **Adding an icon:** copy the Lucide SVG markup into the `PW_ICONS` map in `pw-icon.data.ts`, keyed by its `lucide<Name>` id (browse names at [lucide.dev/icons](https://lucide.dev/icons)). Do **not** add a runtime dependency on an icon package.
- **Kept as-is:** social brand marks (X / Facebook / Reddit — Lucide has no brand icons) and `<kbd>` keyboard-key labels.

---

## 🔤 Balloon Fonts

Speech balloons render with real comic lettering fonts. The **open-licensed set**
(SIL OFL 1.1, from Google Fonts — Bangers, Comic Neue, Caveat, Anton, and 10 more
families) ships with the package under `assets/fonts/balloon/`. Include the
`@font-face` declarations once in your application:

```json
// angular.json → build options
"styles": [
  "node_modules/@panelwave/player/src/assets/fonts/balloon/balloon-fonts.css",
  "src/styles.css"
]
```

(or `@import` the file from your global stylesheet — the font URLs are relative
to the css file, so both work).

**Ames Pro** (Blambot) is a **commercial** font and is *not* included in this
MIT package. If your works use it, license it from [blambot.com](https://blambot.com)
and add your own `@font-face` for `'Ames Italic'` / `'Ames Bold Italic'` /
`'Ames Regular'`. Without it, balloons fall back to Comic Neue (the default
stack is `'Ames Italic', 'Comic Neue', sans-serif`). See
[`assets/fonts/balloon/LICENSES.md`](projects/player/src/assets/fonts/balloon/LICENSES.md).

The speech-bubbles overlay re-renders once `document.fonts.ready` resolves, so
balloons are measured with the real fonts even when they load late.

---

## 📚 Documentation

- [Library README](projects/player/README.md) - Public API, components, and usage
- [Library Structure](projects/player/STRUCTURE.md) - Directory organization
- [Balloon Renderer Sync](docs/BALLOON_RENDERER_SYNC.md) - Keeping ComicBalloon in sync with the CMS

Planning documents and the per-component implementation reports live in the
internal PanelWave docs repo (not part of this repository): specs and the
development checklist under `docs/technical/player/`, historical phase and
component completion reports under `docs/archive/player/repo-history/`.

---

## 📊 Development Status

### ✅ Completed Phases (1-6)

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Foundation (Types, Utilities) | ✅ Complete |
| 2 | Core Services (State, Manifest, Flow, Variables) | ✅ Complete |
| 3 | Rendering Engine (Viewport, Layers) | ✅ Complete |
| 4 | UI Components (Shell, Toolbar, Modals) | ✅ Complete |
| 5 | Media Systems (Cache, Audio, Video, Preload) | ✅ Complete |
| 6 | Advanced Features (Entitlements, Plugins, Tracking) | ✅ Complete |

### 📋 Remaining Phases

| Phase | Component | Status |
|-------|-----------|--------|
| 7 | Testing & QA | 🔄 In Progress |
| 8 | Documentation & Deployment | 🔄 In Progress (npm, CI and demo deploy done 2026-09-27) |

### 📐 Format Support

The player renders **PanelWave manifest format 1.6** (the schema lives at `schema/1.0/` and is versioned via its `title`/`panelwave.version`):

| Format | Feature | Player support |
|--------|---------|----------------|
| 1.0 | Base format | ✅ |
| 1.1 | Video panels (sequenced video layers, playback config) | ✅ |
| 1.2 | Edge-transition inheritance (`outputPresets.defaultTransition`), optional `mime` | ✅ |
| 1.3 | Typography style presets (`textStyles` / `balloonPresets` + `styleRef`) | ✅ |
| 1.4 | Infinite-canvas view mode (canvas placements, camera) | ✅ |
| 1.5 | Asset folders + localization blocks (authoring metadata for the work archive) | ➖ read and ignored (not needed to render) |
| 1.6 | Paywall product lists (`requiredProductIds` on purchase rules) and product display info (`paywall.products`) | ✅ |

---

## 🧪 Development

### Prerequisites

```bash
# Required
- Node.js 24.x (CI uses 24)
- npm 11.x (the lockfile is written by npm 11; npm 10 rejects it in `npm ci`)
- Angular CLI 20+
```

### Setup

```bash
# Clone repository
git clone https://github.com/panelwave/player.git panelwave-player
cd panelwave-player

# Install dependencies
npm install

# Run demo application
npm start
# or
ng serve demo

# Access demo at http://localhost:4200
```

### Development Commands

```bash
# Build library
ng build player
# Output: dist/player/

# Build library (watch mode)
ng build player --watch

# Run unit tests
ng test player

# Run tests with coverage
ng test player --code-coverage

# Lint code
ng lint

# Format code
prettier --write .
```

### Testing

```bash
# Unit tests (Jasmine + Karma)
ng test player

# With coverage report
ng test player --code-coverage
# Report: coverage/player/index.html

# Single run (CI mode)
ng test player --watch=false --browsers=ChromeHeadless
```

#### E2E tests (Playwright)

The E2E suite drives the demo app (started automatically on port 4222) and is
hermetic — external image hosts are stubbed. Specs live in `e2e/`.

```bash
npm run e2e       # chromium + mobile (Pixel 7) projects
npm run e2e:all   # additionally firefox + webkit
npm run e2e:ui    # interactive UI mode
```

The demo app supports a `?deny=<panelId>[,<panelId>]` query parameter that installs
a denying entitlement adapter, used by the gating tests, and `?byUrl=1`, which
hands the shell the manifest URL (`manifestUrl` input) instead of the parsed
object.

---

## 📦 Building & Publishing

### Build Library

```bash
# Production build
ng build player --configuration production

# Output: dist/player/
# - ESM modules
# - TypeScript declarations
# - package.json
# - README.md
```

### Releases (npm)

`@panelwave/player` is published to [npm](https://www.npmjs.com/package/@panelwave/player) by the **`release` workflow** ([`.github/workflows/release.yml`](.github/workflows/release.yml)), not from a local machine:

1. Actions → **release** → Run workflow → choose `patch` / `minor` / `major` / `prerelease`.
2. The workflow lints and builds, bumps `projects/player/package.json`, publishes `dist/player` with **npm trusted publishing** (OIDC, no stored token, provenance attached), commits the bump, tags `vX.Y.Z` and creates the GitHub release.

The npm page shows [`projects/player/README.md`](projects/player/README.md) (the package README), so changes to it appear on npm with the next release. Package metadata (peer dependencies, keywords, `files`) lives in [`projects/player/package.json`](projects/player/package.json).

Check what would be published:

```bash
ng build player --configuration production
cd dist/player && npm pack --dry-run
```

### CI

| Workflow | Runs on | What it does |
|---|---|---|
| `ci.yml` | push to `master`, PRs | lint, unit tests, library build, Playwright E2E (in the `mcr.microsoft.com/playwright` image, whose tag must match the locked `@playwright/test` version) |
| `demo-pages.yml` | push to `master` | builds the demo app and deploys it to [panelwave.github.io/player](https://panelwave.github.io/player/) |
| `size-limit.yml` | PRs | fails when the FESM bundle, minified + gzipped (what a host ships), exceeds 180 KB |
| `release.yml` | manual | npm release (above) |

---

## 🎮 Usage Examples

### Load Manifest from URL

```html
<pw-player-shell manifestUrl="https://example.com/story/panelwave.json"></pw-player-shell>
```

### Load Manifest from Object

```typescript
import { PanelWaveManifest } from '@panelwave/player';

const manifest: PanelWaveManifest = {
  panelwave: {
    version: '1.4.0',
    schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json',
  },
  meta: { /* ... */ },
  chapters: [ /* ... */ ],
  // ...
};

<pw-player-shell [manifest]="manifest"></pw-player-shell>
```

### Paywalls and Entitlements

Paywall rules come from the manifest's `paywall` block. Tell the shell what the reader owns (an `EntitlementSnapshot`) and handle checkout yourself:

```html
<pw-player-shell
  [manifestUrl]="url"
  [entitlementSnapshot]="{ subscriptionTier: null, purchasedProductIds: ['chapter-2'], ageVerified: false }"
  (paywallAction)="onPaywall($event)">
</pw-player-shell>
```

Or let the shell fetch the snapshot itself with `entitlementEndpoint` (`{workId}` is substituted) plus `readerToken`. Without a snapshot an anonymous one is used: readers see the free preview and the paywall overlay at the gate.

Rule scopes: `work` gates everything after its free preview (counted across the work); `chapter` gates only the panels of the chapter named by `refId`, with `previewPanels` counted **within that chapter**, and wins over a work rule for those panels; `panel` gates exactly its panels (no preview); `extras` never gates panels — it locks the extras block named by `refId` in the extras viewer. `ageGate` / `minimumAge` adds an age check on top of the rule's entitlement: the reader first answers the age gate, then sees the paywall if the purchase / subscription is still missing; only a rule with no entitlement and an age is a pure age gate.

The built-in overlay offers what the blocking rule sells: a **Buy** option per required product (`requiredProductIds` — format 1.6; owning any one of them unlocks the rule — else the `requireEntitlement` key, else the rule id) for purchase rules and a **Subscribe** option per tier (`subscriptionTiers`) for subscription rules. Each option takes its label, description and price from the matching `paywall.products` entry (format 1.6; name and description in the reader's locale, falling back to the work's default locale), else the rule's `name` (single option) or the bare id (several options), and the rule's `description` / `price`; **Sign in** and **Maybe later** stay. The same options are on `gate.options`. `paywallAction` emits `{ action, gate, productId? }` with `action` = `'purchase' | 'subscribe' | 'login' | 'dismiss'` (`productId` = the chosen product id or tier). Run checkout, then call `refreshEntitlements(snapshot)` on the shell or pass a new `entitlementSnapshot`; the overlay closes once the reader is through. While the paywall or the age gate is open, story keys and swipes do nothing, and edge mutations of a blocked move are not applied.

> **Note on `EntitlementAdapter`:** the `entitlementAdapter` input is typed with an interface local to `player-shell.component.ts` (`hasAccess` / `getContext` / `purchase?`), which differs from the exported `EntitlementAdapter` in `lib/types` (`resolveEntitlement`, `getSignedUrl?`, …). Until the two are unified, prefer the snapshot inputs above. `NullEntitlementAdapter` (everything allowed) and `MockEntitlementAdapter` (for testing) are exported.

### Speech Bubble Configuration

Speech bubbles are rendered using the `ComicBalloon` SVG engine. Styling cascades: work defaults (`settings.typography.balloon_config`) → character override → named preset (`styleRef` into `settings.typography.balloonPresets`, format 1.3+) → inline per-bubble override.

```typescript
import { DEFAULT_BALLOON_CONFIG, mergeBalloonConfig } from '@panelwave/player';
import type { BalloonConfig, BalloonConfigOverride } from '@panelwave/player';

// Work-level defaults (set in manifest settings.typography.balloon_config)
const workDefaults: BalloonConfig = {
  ...DEFAULT_BALLOON_CONFIG,
  balloonType: 'normal',       // normal | rectangle | cutTop | thought | shout | whisper | connector
  cornerRadius: 0.5,           // 0 = rectangle, 1 = ellipse
  fontFamily: "'Ames Italic', sans-serif",
  fontSize: 12,
  strokeWidth: 2,
  strokeColor: '#000000',
  fillColor: '#ffffff',
  tail: {
    enabled: true,
    position: 180,             // compass degrees (0=top, 90=right, 180=bottom, 270=left)
    length: 45,
    curve: 'straight',         // straight | left | right
    curveAmount: 0.4,
  },
  hideBorder: { enabled: false, angle: 0, arc: 60 },
};

// Character-level override (only overridden fields)
const villainStyle: BalloonConfigOverride = {
  balloonType: 'shout',
  fillColor: '#ffe0e0',
  tail: { curve: 'right', curveAmount: 0.6 },
};

// Merge: work defaults → character override
const effective = mergeBalloonConfig(workDefaults, villainStyle);
```

### Interact with Plugins

Plugin layers are declared in the manifest and rendered in a sandboxed iframe (`PluginSandboxComponent`). The host application talks to them via `PluginHostService`:

```typescript
import { PluginHostService } from '@panelwave/player';

constructor(private pluginHost: PluginHostService) {
  // Expose a host API method plugins may call
  this.pluginHost.registerAPIHandler('myApp.getUser', async () => this.currentUser);

  // Broadcast an event to all running plugins
  this.pluginHost.emitEventToPlugins('theme.changed', { theme: 'dark' });
}
```

### Listen to Events

The shell component emits everything you need as outputs:

```html
<pw-player-shell
  [manifestUrl]="url"
  (ready)="onReady()"
  (panelChange)="onPanelChange($event)"
  (chapterChange)="onChapterChange($event)"
  (variableChange)="onVariableChange($event)"
  (localeChange)="onLocaleChange($event)"
  (cameraChange)="onCameraChange($event)"
  (error)="onError($event)">
</pw-player-shell>
```

`panelChange` carries the panel's id (its key in `chapter.panels`) and the
id of the panel before it. Read the id from `panelId`, not from `panel`:
`Panel.id` is optional in the format and usually absent.

```typescript
import type { PlayerPanelChangeEvent } from '@panelwave/player';

onPanelChange(e: PlayerPanelChangeEvent) {
  console.log('Navigated to panel', e.panelId, 'in chapter', e.chapter.id, 'from', e.previousPanelId);
}
```

Or subscribe to the state service directly (`currentPanel$` emits the
`Panel` object only; the id comes with `panelChange`):

```typescript
import { PlayerStateService } from '@panelwave/player';

constructor(private playerState: PlayerStateService) {
  this.playerState.currentPanel$.subscribe(panel => {
    console.log('Navigated to panel:', panel?.title);
  });
}
```

---

## 🔧 Component API

`PlayerShellComponent` (selector `pw-player-shell`) is configured via inputs. All of them may change after init: a new `manifest` / `manifestUrl` reloads the work (position, non-persistent variables, open overlays and autoplay reset), `entitlementSnapshot` re-evaluates the gates, and `locale`, `viewModeOverride`, `showToolbar`, `reducedMotion`, `secondsPerPanel` and `autoplay` apply live. (`initialVariables`, `initialChapterId` / `initialPanelId` and the entitlement endpoint are read on (re)load.)

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `manifest` | `PanelWaveManifest` | — | Load a manifest object directly |
| `manifestUrl` | `string` | — | Load a manifest from a URL |
| `entitlementAdapter` | shell-local `EntitlementAdapter` | — | Custom entitlement integration (see the note under Paywalls) |
| `entitlementSnapshot` | `EntitlementSnapshot` | anonymous | What the reader owns; activates the manifest's `paywall.rules` |
| `entitlementEndpoint` / `readerToken` | `string` | — | Fetch the snapshot from an endpoint (`{workId}` substituted) with a bearer token |
| `initialVariables` | `Record<string, unknown>` | — | Seed variables once at start (may set `readOnly` ones, e.g. a verified `user.age`) |
| `locale` | `LocaleCode` | `'en-US'` | Initial locale |
| `initialChapterId` | `string` | — | Start at a specific chapter |
| `initialPanelId` | `string` | — | Start at a specific panel |
| `autoplay` | `boolean` | `false` | Start auto-advancing (the reader's toolbar toggle takes over afterwards) |
| `secondsPerPanel` | `number` | `5` | Autoplay interval |
| `reducedMotion` | `boolean` | `false` | Force reduced motion |
| `showToolbar` | `boolean` | `false` | Show the bottom toolbar |
| `viewModeOverride` | `'auto' \| 'panel' \| 'canvas'` | `'auto'` | Force panel or infinite-canvas view |

And emits these outputs:

| Output | Payload | Fires when |
|--------|---------|------------|
| `ready` | `void` | Manifest loaded, player ready |
| `panelChange` | `PlayerPanelChangeEvent`: `{ panel, chapter, panelId, previousPanelId? }` | Navigation to a new panel; `panelId` is its key in `chapter.panels`, `previousPanelId` the panel before it (unset for the first panel after a load) |
| `chapterChange` | `Chapter` | Chapter boundary crossed |
| `localeChange` | `LocaleCode` | Language switched |
| `variableChange` | `{ key, value }` | A story variable changed |
| `navigationAttempt` | `{ direction, target? }` | Any navigation attempt |
| `cameraChange` | `CameraState` | Canvas-view camera moved |
| `paywallAction` | `{ action, gate, productId? }` | Reader clicks Buy (`purchase`) / Subscribe (`subscribe`) / Sign in (`login`) / Maybe later (`dismiss`) on the paywall |
| `ageVerified` | `AgeVerificationResult` | Reader answers an age gate |
| `likeChange` / `bookmarkChange` | `{ workId, … }` | Like or bookmark toggled (also persisted locally) |
| `error` | `Error` | Loading/runtime error |

---

## 🤝 Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Write/update tests
5. Run tests (`ng test player`)
6. Commit with conventional commits (`feat: add amazing feature`)
7. Push to your fork
8. Open a Pull Request

### Code Style

- **Angular:** Follow Angular style guide
- **TypeScript:** Strict mode enabled
- **Formatting:** Prettier (automatic)
- **Linting:** ESLint with Angular rules

### Commit Convention

```
feat: Add new feature
fix: Bug fix
docs: Documentation update
test: Add/update tests
refactor: Code refactoring
perf: Performance improvement
chore: Build/tooling changes
```

---

## 📈 Performance Targets

| Metric | Target | Current (2026-09) |
|--------|--------|--------|
| Bundle size (minified + gzipped) | ≤180KB (`size-limit` in CI) | 106KB (raw FESM gzipped: 192KB) |
| Lighthouse Performance | >85 | desktop ✓; mobile 74 (accepted for 1.0) |
| Accessibility | no serious/critical axe violations | ✓ every modal, overlay and view (`e2e/accessibility.spec.ts`) |
| Test Coverage | >80% statements | 80.4% (1539 unit specs) |
| Frame Rate / memory | no long frames, no heap growth | ✓ guarded by `e2e/performance.spec.ts` |

---

## 🌐 Browser Support

### Desktop
- Chrome/Edge 120+
- Firefox 120+
- Safari 17+

### Mobile
- iOS Safari 17+
- Android Chrome 120+

---

## 📄 License

**MIT License**

Copyright (c) 2025 PanelWave Project

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## 🎉 Acknowledgments

Built with:
- **Angular Team** - Frontend framework
- **RxJS Team** - Reactive programming
- **json-logic-js** - Condition evaluation
- **TypeScript Team** - Type safety

---

## 📞 Links

- **Documentation:** https://docs.panelwave.org/player/overview (package README: [projects/player/README.md](projects/player/README.md))
- **Specifications:** internal docs repo (`docs/technical/player/`)
- **npm Package:** [@panelwave/player](https://www.npmjs.com/package/@panelwave/player)
- **Live demo:** https://panelwave.github.io/player/
- **Schema:** https://panelwave.org/schema/1.0/panelwave.schema.json (manifest format 1.6.0)
- **Issues:** https://github.com/panelwave/player/issues
- **Source:** https://github.com/panelwave/player (moved from Bitbucket 2026-09-27)

---

**Version:** 1.0.1 on npm (Phase 6 complete + format 1.1–1.5 features; 1.6 on master, unreleased)  
**Last Updated:** 2026-09-27  
**Status:** Released (1.x); Testing & QA ongoing

### Recent Updates
- **2026-09-27:** Published on npm as `@panelwave/player` (1.0.0, then 1.0.1 via the release workflow with trusted publishing + provenance); repo moved to GitHub; CI, E2E and GitHub Pages demo live; package README rewritten
- **2026-07-25:** Responsive image variant selection (variant ladder `w640`–`w2560`, `image-variant-utils`)
- **2026-07-24:** Infinite-canvas view mode (format 1.4): `CanvasStageComponent`, `CanvasCameraService`, `viewModeOverride` input, `cameraChange` output
- **2026-07 (mid):** Typography style presets (format 1.3): `settings.typography.textStyles` / `balloonPresets` with `styleRef` cascade
- **2026-07-12:** Edge transitions rendered in panel view, with `outputPresets.defaultTransition` inheritance (format 1.2)
- **2026-07-02:** Video panels (format 1.1): `VideoSequencerService`, `VideoLayerComponent`, per-work/per-panel playback config
- **2026-04-14:** Integrated full speech bubble/balloon rendering from CMS (ComicBalloon SVG renderer, 9 balloon types, configurable tails, hide-border effects, per-character and per-bubble style overrides, panel + page view support)
- **2025-11-27:** Upgraded to Angular 20.3.14 with TypeScript 5.8.3
- **2025-10-16:** Completed Phase 6 (Advanced Features)
