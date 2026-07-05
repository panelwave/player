# PanelWave Player

**Open-source Angular library** for rendering interactive graphic novels in the PanelWave JSON format. High-performance, accessible, and extensible player with graph-based navigation, multilingual support, and plugin system.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-20%2B-red)](https://angular.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

> **Documentation:** [docs.panelwave.org/player/overview](https://docs.panelwave.org/player/overview)

---

## 🎯 Overview

PanelWave Player is an **Angular 20+ library** that renders interactive graphic novels using the open **PanelWave JSON format**. It provides a complete, production-ready player with advanced features:

- **📖 Graph-Based Navigation** - Non-linear storytelling with conditional branching
- **🌍 Multilingual Support** - Runtime language switching with localized assets
- **♿ Accessibility First** - WCAG 2.1 AA compliance, keyboard navigation, screen reader support
- **🎮 Interactive Layers** - Hotspots, speech bubbles (9 balloon types with SVG rendering), variants, parallax effects
- **🔌 Plugin System** - Extensible with custom components (360° viewer, mega-zoom, mini-games)
- **💰 Monetization Ready** - Paywall adapter interface for entitlement checks
- **🎨 Media Rich** - Image caching, WebAudio mixing, video playback, preloading
- **📊 Analytics** - Tracking service with event hooks

---

## 🚀 Quick Start

### Installation

```bash
npm install @panelwave/player
```

### Basic Usage

```typescript
import { Component } from '@angular/core';
import { PlayerShellComponent } from '@panelwave/player';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PlayerShellComponent],
  template: `<pw-player [manifestUrl]="manifestUrl"></pw-player>`
})
export class AppComponent {
  manifestUrl = 'assets/my-story/panelwave.json';
}
```

### With Custom Configuration

```typescript
import { PlayerConfig } from '@panelwave/player';

const config: PlayerConfig = {
  locale: 'en',
  autoplay: false,
  enableKeyboardNav: true,
  enableTracking: true,
  preloadDistance: 3,
  cacheSizeLimit: 50 * 1024 * 1024 // 50MB
};

<pw-player [manifestUrl]="url" [config]="config"></pw-player>
```

---

## 🎨 Key Features

### ✅ Core Navigation
- **Graph-Based Flow** - Panels connected by edges with conditions
- **Decision Trees** - JSON Logic for branching narratives
- **Variables** - 5 scopes (global, chapter, page, session, persistent)
- **History Navigation** - Back/forward with state preservation
- **Keyboard Shortcuts** - Arrow keys, spacebar, hotkeys

### ✅ Content & Media
- **Layer System** - Image, video, text, audio, plugin layers
- **Speech Bubbles** - Comic-book balloon rendering (normal, thought, shout, whisper, connector, cut-top variants) with configurable tails, hide-border effects, and per-character/per-bubble style overrides
- **Hotspots** - Interactive areas (rect, circle, polygon) with actions
- **Variants** - Conditional content based on variables/entitlements
- **Preloading** - Intelligent lookahead with configurable distance
- **Image Cache** - LRU cache with memory budget management
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
│   │       ├── types/             # TypeScript interfaces (7 files)
│   │       │   ├── manifest.types.ts
│   │       │   ├── panel.types.ts
│   │       │   ├── asset.types.ts
│   │       │   ├── graph.types.ts
│   │       │   ├── variable.types.ts
│   │       │   ├── player.types.ts
│   │       │   └── entitlement.types.ts
│   │       │
│   │       ├── services/          # Core services (10+ services)
│   │       │   ├── player-state.service.ts
│   │       │   ├── manifest.service.ts
│   │       │   ├── variable-store.service.ts
│   │       │   ├── flow-engine.service.ts
│   │       │   ├── image-cache.service.ts
│   │       │   ├── audio-engine.service.ts
│   │       │   ├── video-controller.service.ts
│   │       │   ├── preload.service.ts
│   │       │   ├── tracking.service.ts
│   │       │   └── plugin-host.service.ts
│   │       │
│   │       ├── components/        # UI components (30+ components)
│   │       │   ├── player-shell/  # Main container
│   │       │   ├── viewport/      # Panel renderer
│   │       │   ├── layers/        # Image, video, text layers
│   │       │   ├── overlays/      # Hotspots, speech bubbles
│   │       │   ├── toolbar/       # Bottom controls
│   │       │   ├── modals/        # Settings, ToC, help
│   │       │   └── helpers/       # Shared UI elements
│   │       │
│   │       ├── utils/             # Helper functions
│   │       │   ├── locale-utils.ts
│   │       │   ├── asset-utils.ts
│   │       │   ├── json-logic-utils.ts
│   │       │   ├── animation-utils.ts
│   │       │   ├── comic-balloon.ts   # SVG balloon renderer
│   │       │   └── balloon-config.ts  # Balloon config utilities
│   │       │
│   │       └── styles/            # Global styles
│   │
│   └── demo/                      # Demo application
│       └── src/
│           └── assets/            # Sample manifests
│
├── docs/                          # Comprehensive documentation (23 files)
│   ├── SETUP_COMPLETE.md
│   ├── TYPE_DEFINITIONS_COMPLETE.md
│   ├── *_COMPLETE.md             # Component/service docs
│   └── TESTS_COMPLETE.md
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
- **Framework:** Angular 20+ (standalone components)
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

### Getting Started
- [Setup Guide](docs/SETUP_COMPLETE.md) - Project setup and configuration
- [Development Checklist](../_spec_player/DEVELOPMENT_CHECKLIST.md) - Phase-by-phase tasks
- [Implementation Plan](../_spec_player/IMPLEMENTATION_PLAN.md) - 8-phase roadmap
- [Technical Specification](../_spec_player/TECHNICAL_SPECIFICATION.md) - Architecture details

### Core Implementation
- [Type Definitions](docs/TYPE_DEFINITIONS_COMPLETE.md) - TypeScript interfaces
- [Utilities](docs/UTILITIES_COMPLETE.md) - Helper functions
- [Player State Service](docs/PLAYER_STATE_SERVICE_COMPLETE.md) - State management
- [Manifest Service](docs/MANIFEST_SERVICE_COMPLETE.md) - Manifest loading
- [Variables & Conditions](docs/VARIANTS_CONDITIONS_COMPLETE.md) - Dynamic content

### Navigation & Flow
- [Flow Engine](docs/VARIANTS_CONDITIONS_COMPLETE.md) - Graph navigation logic

### Rendering Engine
- [Viewport Component](docs/VIEWPORT_COMPONENT_COMPLETE.md) - Main renderer
- [Layer Components](docs/LAYER_COMPONENTS_COMPLETE.md) - Image, video, text layers
- [Interaction Overlays](docs/INTERACTION_OVERLAYS_COMPLETE.md) - Hotspots, speech bubbles
- [Overlay Components](docs/OVERLAY_COMPONENTS_COMPLETE.md) - UI overlays

### UI Components
- [Player Shell](docs/PLAYER_SHELL_COMPONENT_COMPLETE.md) - Main container
- [Toolbar](docs/TOOLBAR_COMPONENT_COMPLETE.md) - Bottom controls
- [Modal Components](docs/MODAL_COMPONENTS_COMPLETE.md) - Settings, ToC, help
- [Helper Components](docs/HELPER_COMPONENTS_COMPLETE.md) - Shared UI

### Media Management
- [Image Cache Service](docs/IMAGE_CACHE_SERVICE_COMPLETE.md) - LRU caching
- [Audio Engine Service](docs/AUDIO_ENGINE_SERVICE_COMPLETE.md) - WebAudio mixer
- [Video Controller Service](docs/VIDEO_CONTROLLER_SERVICE_COMPLETE.md) - Video playback
- [Preload Service](docs/PRELOAD_SERVICE_COMPLETE.md) - Asset preloading

### Advanced Features
- [Entitlement & Paywall](docs/ENTITLEMENT_PAYWALL_COMPLETE.md) - Monetization
- [Plugin API](docs/PLUGIN_API_COMPLETE.md) - Extension system
- [Tracking Service](docs/TRACKING_SERVICE_COMPLETE.md) - Analytics
- [Export Interfaces](docs/EXPORT_INTERFACES_COMPLETE.md) - Public API

### Testing
- [Tests Complete](docs/TESTS_COMPLETE.md) - Test coverage report

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
| 8 | Documentation & Deployment | 📋 Planned |

---

## 🧪 Development

### Prerequisites

```bash
# Required
- Node.js 20.x
- npm 10.x
- Angular CLI 20+
```

### Setup

```bash
# Clone repository
git clone <repository-url>
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

### Publish to npm

```bash
# Build for production
ng build player --configuration production

# Navigate to dist
cd dist/player

# Publish to npm
npm publish --access public
```

### Package Metadata

```json
{
  "name": "@panelwave/player",
  "version": "1.0.0",
  "description": "Open-source Angular library for PanelWave interactive graphic novels",
  "keywords": ["angular", "graphic-novel", "webcomic", "interactive", "player"],
  "license": "MIT",
  "peerDependencies": {
    "@angular/common": "^20.0.0",
    "@angular/core": "^20.0.0"
  }
}
```

---

## 🎮 Usage Examples

### Load Manifest from URL

```typescript
<pw-player manifestUrl="https://example.com/story/panelwave.json"></pw-player>
```

### Load Manifest from Object

```typescript
import { PanelWaveManifest } from '@panelwave/player';

const manifest: PanelWaveManifest = {
  version: '1.0',
  meta: { /* ... */ },
  chapters: [ /* ... */ ],
  // ...
};

<pw-player [manifest]="manifest"></pw-player>
```

### Custom Entitlement Adapter

```typescript
import { EntitlementAdapter } from '@panelwave/player';
import { Injectable } from '@angular/core';

@Injectable()
export class MyEntitlementAdapter implements EntitlementAdapter {
  async checkEntitlement(scope: string, id: string): Promise<boolean> {
    // Check user subscription
    const hasAccess = await this.api.checkAccess(scope, id);
    return hasAccess;
  }
  
  async getPreviewAssetUrl(assetId: string): Promise<string> {
    return `https://cdn.example.com/previews/${assetId}`;
  }
}

// Provide adapter
<pw-player 
  [manifestUrl]="url" 
  [entitlementAdapter]="myAdapter">
</pw-player>
```

### Speech Bubble Configuration

Speech bubbles are rendered using the `ComicBalloon` SVG engine. Styling cascades from work-level defaults through character overrides to per-bubble overrides.

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

### Register Custom Plugin

```typescript
import { PluginHostService } from '@panelwave/player';

constructor(private pluginHost: PluginHostService) {
  this.pluginHost.registerPlugin('my-360-viewer', My360Component);
}
```

### Listen to Events

```typescript
import { PlayerStateService } from '@panelwave/player';

constructor(private playerState: PlayerStateService) {
  // Subscribe to current panel
  this.playerState.currentPanel$.subscribe(panel => {
    console.log('Navigated to panel:', panel?.id);
  });
  
  // Subscribe to player events
  this.playerState.events$.subscribe(event => {
    if (event.type === 'panel.viewed') {
      // Track analytics
    }
  });
}
```

---

## 🔧 Configuration Options

```typescript
export interface PlayerConfig {
  // Locale
  locale?: string;                   // Default: 'en'
  fallbackLocale?: string;           // Default: 'en'
  
  // Behavior
  autoplay?: boolean;                // Default: false
  autoplayDelay?: number;            // Default: 5000ms
  enableKeyboardNav?: boolean;       // Default: true
  enableSwipeGestures?: boolean;     // Default: true
  
  // Preloading
  preloadDistance?: number;          // Default: 2 (panels ahead)
  cacheSizeLimit?: number;           // Default: 50MB
  
  // Media
  audioVolume?: number;              // Default: 0.7 (0-1)
  enableAudio?: boolean;             // Default: true
  
  // Tracking
  enableTracking?: boolean;          // Default: false
  trackingEndpoint?: string;         // Analytics endpoint
  
  // UI
  showToolbar?: boolean;             // Default: true
  showThumbnails?: boolean;          // Default: true
  theme?: 'light' | 'dark' | 'auto'; // Default: 'auto'
}
```

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

| Metric | Target | Current |
|--------|--------|--------|
| Bundle size (gzipped) | <150KB | TBD |
| Time to Interactive | <3s | TBD |
| First Contentful Paint | <1.5s | TBD |
| Lighthouse Performance | >85 | TBD |
| Lighthouse Accessibility | 100 | TBD |
| Test Coverage | >80% | TBD |
| Frame Rate | 60fps | TBD |

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

- **Documentation:** [docs/](docs/)
- **Specifications:** [../_spec_player/](../_spec_player/)
- **npm Package:** [@panelwave/player](https://www.npmjs.com/package/@panelwave/player) (coming soon)
- **Schema:** https://panelwave.org/schema/1.0/panelwave.schema.json
- **Issues:** GitHub Issues (coming soon)
- **Discussions:** GitHub Discussions (coming soon)

---

**Version:** 1.0.0 (Phase 6 Complete)  
**Last Updated:** 2026-04-14  
**Status:** 🚧 In Development (Testing & QA phase)

### Recent Updates
- **2026-04-14:** Integrated full speech bubble/balloon rendering from CMS (ComicBalloon SVG renderer, 9 balloon types, configurable tails, hide-border effects, per-character and per-bubble style overrides, panel + page view support)
- **2025-11-27:** Upgraded to Angular 20.3.14 with TypeScript 5.8.3
- **2025-10-16:** Completed Phase 6 (Advanced Features)
