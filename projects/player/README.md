# @panelwave/player

**The open-source Angular player for interactive graphic novels.** It renders
[PanelWave](https://panelwave.org) manifests (`panelwave.json`): branching panel
graphs, layered artwork, comic speech balloons, hotspots, video panels, audio,
story variables, multilingual text and paywalls, all in one component.

[![npm](https://img.shields.io/npm/v/@panelwave/player.svg)](https://www.npmjs.com/package/@panelwave/player)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/panelwave/player/blob/master/LICENSE)
[![Angular](https://img.shields.io/badge/Angular-20%20%7C%2021%20%7C%2022-red)](https://angular.dev)

**[Live demo](https://panelwave.github.io/player/)** ·
**[Documentation](https://docs.panelwave.org/player/overview)** ·
**[Format spec](https://github.com/panelwave/schema)** ·
**[Source](https://github.com/panelwave/player)**

---

## What it does

A PanelWave story is a **directed graph of panels**. Each chapter has an entry
panel and edges between panels. Edges can carry a transition and a
[JSON Logic](https://jsonlogic.com) condition, so readers' choices and story
variables decide where the story goes. The player takes that manifest and turns
it into a complete reading experience:

- **Graph navigation:** branching and conditional paths, back/forward history,
  resume from the last position, per-edge transitions.
- **Two view modes:** classic one-panel-at-a-time reading, or an
  **infinite canvas** where panels sit on a 2D stage and the camera pans and
  zooms between them.
- **Layered panels:** image, video, text, audio and plugin layers, with
  responsive image variants (`w640`–`w2560`) and smart preloading.
- **Speech balloons:** an SVG lettering engine with 9 balloon types (normal,
  thought, shout, whisper, connector, …). Tails, style presets and
  per-character overrides are all configurable.
- **Hotspots:** clickable areas that navigate, set variables, open extras or
  modals, or talk to plugins. They're keyboard-accessible and tracked.
- **Variables and variants:** five scopes (global, chapter, page, session,
  persistent). Panel variants swap content based on variables, e.g. an
  age-appropriate version.
- **Audio and video:** a WebAudio mixer (ambient, music, voice-over, SFX) and
  sequenced video panels.
- **Localization:** switch languages at runtime with fallback chains,
  per-locale assets and RTL support. The UI ships in English and German.
- **Monetization hooks:** paywall rules from the manifest (subscription,
  purchase, age gates), evaluated against what the reader owns. Your app
  handles checkout; the player never talks to a payment provider itself.
- **Accessibility:** full keyboard control, screen-reader announcements,
  `prefers-reduced-motion`, content warnings, and no serious axe violations.
- **Reader toolbar:** table of contents, thumbnails, autoplay, settings,
  share, like and bookmark.

Stories are authored in the PanelWave CMS or written by hand against the
[open JSON Schema](https://github.com/panelwave/schema). The player supports
manifests up to format 1.6 (video panels, edge-transition inheritance,
typography style presets, the infinite canvas, paywall rules unlocked by any
of several products, each Buy option named and priced from `paywall.products`; 1.5's asset folders and localization blocks are
authoring metadata the player doesn't need).

## Installation

```bash
npm install @panelwave/player @ngx-translate/core
```

Peer dependencies: `@angular/core` and `@angular/common` **^20, ^21 or ^22**,
`@ngx-translate/core` **^17 or ^18**, `rxjs` **^7.8**.

**Angular compatibility.** The package is compiled with Angular 20 in partial
(linker) mode, so newer Angular versions link it at build time. Every CI run
installs the packed library into a fresh `ng new` app on Angular 20, 21 and
22 with ngx-translate 18, and on Angular 20 and 22 with ngx-translate 17
(strict peer resolution, production build, headless render of a sample
manifest); the player works with zone.js and zoneless change detection (the
default for new Angular 21+ apps).

## Setup

**1. Providers.** The player loads manifests over HTTP and uses ngx-translate
for its UI strings:

```typescript
// app.config.ts
import { ApplicationConfig, inject } from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { TranslateLoader, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

class PlayerTranslateLoader implements TranslateLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string): Observable<TranslationObject> {
    return this.http.get<TranslationObject>(`./assets/i18n/${lang}.json`);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideTranslateService({
      loader: { provide: TranslateLoader, useClass: PlayerTranslateLoader },
    }),
  ],
};
```

This works with ngx-translate 17 and 18. (`TranslateModule.forRoot()` still
works on 17 but no longer exists in 18.) Pass the loader as an explicit
provider as shown: on 18, `provideTranslateLoader(PlayerTranslateLoader)`
fails in production builds for a plain (non-`@Injectable`) class, because
18 tells classes from factory functions by their source text, and the
minified class no longer looks like one ("Class constructor … cannot be
invoked without 'new'").

**2. Assets and fonts.** Copy the player's UI translations into your app,
and include the balloon lettering fonts:

```jsonc
// angular.json → projects.<app>.architect.build.options
"assets": [
  { "glob": "*.json", "input": "node_modules/@panelwave/player/src/assets/i18n", "output": "assets/i18n" }
],
"styles": [
  "node_modules/@panelwave/player/src/assets/fonts/balloon/balloon-fonts.css",
  "src/styles.css"
]
```

The bundled fonts are open-licensed (SIL OFL 1.1: Bangers, Comic Neue,
Caveat, Anton and 10 more). The commercial Blambot font **Ames Pro** is not
included. If your works use it, license it from [blambot.com](https://blambot.com)
and add your own `@font-face`. Otherwise balloons fall back to Comic Neue.

The player depends on `json-logic-js`, a CommonJS module. To silence the
build warning about it, add `"allowedCommonJsDependencies": ["json-logic-js"]`
to the same build options.

## Usage

```typescript
import { Component } from '@angular/core';
import { PlayerShellComponent, type PlayerPanelChangeEvent } from '@panelwave/player';

@Component({
  selector: 'app-reader',
  imports: [PlayerShellComponent],
  template: `
    <pw-player-shell
      manifestUrl="/stories/my-story/panelwave.json"
      locale="en-US"
      [showToolbar]="true"
      (panelChange)="onPanel($event)"
      (error)="onError($event)" />
  `,
  styles: `:host { display: block; height: 100dvh; }`,
})
export class ReaderComponent {
  onPanel(e: PlayerPanelChangeEvent) {
    console.log(`panel ${e.panelId} in chapter ${e.chapter.id} (came from ${e.previousPanelId ?? 'start'})`);
  }
  onError(err: Error) { console.error(err); }
}
```

You can also pass a manifest object instead of a URL: `[manifest]="manifest"`
(type `PanelWaveManifest`).

### Inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `manifestUrl` | `string` | | Load the manifest from a URL |
| `manifest` | `PanelWaveManifest` | | Or pass the manifest object directly |
| `locale` | `LocaleCode` | `'en-US'` | Initial locale (BCP-47) |
| `initialChapterId` / `initialPanelId` | `string` | | Start at a specific position (otherwise: bookmark, then chapter entry) |
| `initialVariables` | `Record<string, unknown>` | | Seed story variables once at start. May set `readOnly` variables, e.g. a verified `user.age` from your account system |
| `showToolbar` | `boolean` | `false` | Show the reader toolbar |
| `autoplay` | `boolean` | `false` | Start auto-advancing; the reader's toolbar toggle takes over afterwards |
| `secondsPerPanel` | `number` | `5` | Autoplay interval |
| `reducedMotion` | `boolean` | `false` | Force reduced motion (the OS setting and the reader's preference also apply) |
| `viewModeOverride` | `'auto' \| 'panel' \| 'canvas'` | `'auto'` | Force panel or infinite-canvas view |
| `entitlementSnapshot` | `EntitlementSnapshot` | anonymous | What the reader owns; turns the manifest's `paywall.rules` on |
| `entitlementEndpoint` / `readerToken` | `string` | | Let the player fetch the snapshot itself (`{workId}` is substituted) |

Inputs may change after init: a new `manifest` / `manifestUrl` reloads the
work (position, non-persistent variables, open overlays and autoplay reset),
a new `entitlementSnapshot` re-evaluates the gates, and `locale`,
`viewModeOverride`, `showToolbar`, `reducedMotion`, `secondsPerPanel` and
`autoplay` apply live.

### Outputs

| Output | Payload | Fires when |
|---|---|---|
| `ready` | `void` | The manifest is loaded and the player is ready |
| `panelChange` | `PlayerPanelChangeEvent`: `{ panel, chapter, panelId, previousPanelId? }` | The reader moves to a new panel. `panelId` is the panel's key in `chapter.panels` (read the id from here: `panel.id` is optional in the format and usually absent); `previousPanelId` is the panel before it, unset for the first panel after a (re)load |
| `chapterChange` | `Chapter` | A chapter boundary is crossed |
| `variableChange` | `{ key, value }` | A story variable changes |
| `localeChange` | `LocaleCode` | The language is switched |
| `navigationAttempt` | `{ direction, target? }` | Any navigation attempt, allowed or not |
| `cameraChange` | `CameraState` | The canvas-view camera moves |
| `paywallAction` | `{ action, gate, productId? }` | The reader clicks Buy (`purchase`), Subscribe (`subscribe`), Sign in (`login`) or Maybe later (`dismiss`) on a paywall; `productId` is the chosen product id or tier |
| `ageVerified` | `AgeVerificationResult` | The reader answers an age gate |
| `likeChange` / `bookmarkChange` | `{ workId, … }` | Like or bookmark toggled (also stored locally) |
| `error` | `Error` | A loading or runtime error happens |

### Paywalls

Declare rules in the manifest's `paywall` block. Then tell the player what the
reader owns, and handle checkout yourself:

```html
<pw-player-shell
  [manifestUrl]="url"
  [entitlementSnapshot]="{ subscriptionTier: null, purchasedProductIds: ['chapter-2'], ageVerified: false }"
  (paywallAction)="onPaywall($event)" />
```

Readers without access see the free preview and a paywall overlay, and
navigation stops at the gate. Works without paywall rules aren't affected.

- **Scopes:** `work` rules gate everything after their free preview;
  `chapter` rules gate only the chapter named by `refId`, with the preview
  counted within that chapter; `panel` rules gate exactly their panels;
  `extras` rules lock an extras block, never panels.
- **Age:** `ageGate` / `minimumAge` is checked on top of the rule's
  entitlement. The reader answers the age gate first, then gets the paywall
  if the purchase or subscription is still missing.
- **Buy / Subscribe:** the overlay offers a Buy option per product of a
  purchase rule and a Subscribe option per tier of a subscription rule (name,
  description and price from the rule), next to Sign in and Maybe later.
  `paywallAction` emits `{ action: 'purchase' | 'subscribe' | 'login' |
  'dismiss', gate, productId? }`; the options are also on `gate.options`.
- **After checkout:** call `refreshEntitlements(snapshot)` on the shell or
  pass a new `entitlementSnapshot`; the overlay closes once the reader is
  through. Story keys and swipes do nothing while the paywall or the age
  gate is open.

### Going further

The package also exports the services and building blocks behind the shell:
`PlayerStateService` (observable reading state), `VariableStoreService`,
`FlowEngineService`, `TranslationService`, `PluginHostService` (message bus
for sandboxed plugin layers), the `ComicBalloon` renderer with
`mergeBalloonConfig`, and all manifest types. See the
[documentation](https://docs.panelwave.org/player/overview) for the full API.

## Browser support

Chrome / Edge 120+, Firefox 120+, Safari 17+ (desktop and iOS),
Android Chrome 120+.

## Related packages

- [`@panelwave/types`](https://www.npmjs.com/package/@panelwave/types): TypeScript types for PanelWave manifests
- [`@panelwave/cli`](https://www.npmjs.com/package/@panelwave/cli): validate, bundle, diff and upgrade manifests
- [PanelWave format](https://github.com/panelwave/schema): the open JSON Schema (CC BY 4.0)

## License

[MIT](https://github.com/panelwave/player/blob/master/LICENSE). The bundled
balloon fonts are under SIL OFL 1.1 (see `src/assets/fonts/balloon/LICENSES.md`),
and the UI icons are from [Lucide](https://lucide.dev) (ISC).
