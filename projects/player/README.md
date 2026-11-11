# @panelwave/player

**The open-source Angular player for interactive graphic novels.** It renders
[PanelWave](https://panelwave.org) manifests (`panelwave.json`): branching panel
graphs, layered artwork, comic speech balloons, hotspots, video panels, audio,
story variables, multilingual text and paywalls, all in one component.

[![npm](https://img.shields.io/npm/v/@panelwave/player.svg)](https://www.npmjs.com/package/@panelwave/player)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/panelwave/player/blob/master/LICENSE)
[![Angular](https://img.shields.io/badge/Angular-21%20%7C%2022-red)](https://angular.dev)

**[Live demo](https://read.panelwave.org/peoplegraphics/47c9ebf3-6f56-4a4d-a75c-fe8c060df192)** ·
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
- **Three view modes:** the work's authored **pages** (one page sequence per
  output format, picked to suit the screen), classic one-panel-at-a-time
  reading, or an **infinite canvas** where panels sit on a 2D stage and the
  camera pans and zooms between them.
- **Shareable positions:** the reading position is a URL (`?page=` /
  `?panel=`), so readers can bookmark and share a page or a panel.
- **Layered panels:** image, video, text, audio and plugin layers, with
  responsive image variants (`w640`–`w2560`), smart preloading, keyframe
  animations and camera moves.
- **Content widgets:** downloads, an audio player, a video modal, scrolling
  text and sandboxed iframes inside a panel, styled by the work's theme.
- **Speech balloons:** an SVG lettering engine with 9 balloon types (normal,
  thought, shout, whisper, connector, …). Tails, style presets and
  per-character overrides are all configurable. Balloons can appear on cue
  (`showAtMs`) and speak their line.
- **Hotspots:** clickable areas that navigate, set variables, open extras or
  modals, or talk to plugins. They're keyboard-accessible and tracked, and
  the option a reader picked stays marked.
- **Variables and variants:** five scopes (global, chapter, page, session,
  persistent). Panel variants swap content based on variables, e.g. an
  age-appropriate version.
- **Audio and video:** a WebAudio mixer (ambient, music, voice-over, SFX),
  timeline music that follows the reader across panels, spoken lines in the
  reader's language with a **Voices** toggle, and sequenced video panels.
- **Localization:** switch languages at runtime with fallback chains,
  per-language text, artwork and audio, and RTL support. The UI ships in
  English and German.
- **Embeds:** lock a player to one chapter and put several on one page; the
  package ships `embed/panelwave-embed.js`, which turns placeholders into
  lazily loaded chapter players.
- **Monetization hooks:** paywall rules from the manifest (subscription,
  purchase, age gates), evaluated against what the reader owns. Your app
  handles checkout; the player never talks to a payment provider itself.
- **Accessibility:** full keyboard control, screen-reader announcements,
  `prefers-reduced-motion`, content warnings, and no serious axe violations.
- **Reader toolbar:** table of contents, thumbnails, autoplay, settings,
  share, like and bookmark.

Stories are authored in the PanelWave CMS or written by hand against the
[open JSON Schema](https://github.com/panelwave/schema). The player supports
manifests up to **format 1.13**: video panels (1.1), edge-transition
inheritance (1.2), typography style presets (1.3), the infinite canvas (1.4),
paywall products (1.6), keyframe animations (1.6), balloons that grow with
their text (1.8), content widgets and timed balloons (1.10), per-language
artwork (1.11), spoken lines (1.12) and framed page placements (1.13). The
asset folders and localization blocks of 1.5 are authoring metadata the
player doesn't need.

## Installation

```bash
npm install @panelwave/player @ngx-translate/core
```

Peer dependencies: `@angular/core` and `@angular/common` **^21 or ^22**,
`@ngx-translate/core` **^17 or ^18**, `rxjs` **^7.8**.

**Angular compatibility.** The package is compiled with Angular 21 in partial
(linker) mode, so newer Angular versions link it at build time; apps on
Angular 20 stay on `@panelwave/player` 1.x. Every CI run installs the packed
library into a fresh `ng new` app on Angular 21 and 22 with ngx-translate 18,
and on Angular 21 with ngx-translate 17
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
Caveat, Anton and 10 more). The commercial font **Ames Pro** (Purastik Graphics) is not
included. If your works use it, license it (web-font license) from [Fontspring](https://www.fontspring.com/fonts/purastik-graphics/ames-pro)
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
| `initialChapterId` / `initialPanelId` | `string` | | Start at a specific position (otherwise: bookmark, then chapter entry). A panel opens in panel view; its chapter is looked up if you leave `initialChapterId` out |
| `initialPageId` | `string` | | Start at a page in page view, e.g. from a `?page=` link. On a screen with another page format, the page showing the same panels opens |
| `initialViewMode` | `'page' \| 'panel'` | page view when the work has pages | The view to open in |
| `initialVariables` | `Record<string, unknown>` | | Seed story variables once at start. May set `readOnly` variables, e.g. a verified `user.age` from your account system |
| `showToolbar` | `boolean` | `false` | Show the reader toolbar |
| `showCover` | `boolean` | `true` | Open on the work's cover when reading starts at the beginning |
| `autoplay` | `boolean` | `false` | Start auto-advancing; the reader's toolbar toggle takes over afterwards |
| `secondsPerPanel` | `number` | `5` | Autoplay time for panels without an authored duration |
| `pauseAutoplayWhenHidden` | `boolean` | `true` | Pause autoplay while the player is mostly off screen or its tab is hidden |
| `pageFormat` | `'auto' \| OutputFormat` | `'auto'` | Page view's page sequence: `'auto'` picks the authored format that suits the screen, a format id forces one |
| `reducedMotion` | `boolean` | `false` | Force reduced motion (the OS setting and the reader's preference also apply) |
| `viewModeOverride` | `'auto' \| 'panel' \| 'canvas'` | `'auto'` | Force panel or infinite-canvas view |
| `chapterScope` | `string` | | Play only this chapter: no jumps out of it, and the table of contents lists only it. Used for chapter embeds |
| `shareUrl` | `string` | current address | The link the share dialog offers |
| `themeOverride` | `PwThemeOverride \| null` | | Widget theme on top of the manifest's `ui.theme`; your fields win |
| `entitlementSnapshot` | `EntitlementSnapshot` | anonymous | What the reader owns; turns the manifest's `paywall.rules` on |
| `entitlementEndpoint` / `readerToken` | `string` | | Let the player fetch the snapshot itself (`{workId}` is substituted) |
| `imageCacheBudgetMb` | `number` | `100` | Decoded-image cache budget; lower it when several players share a page |
| `trackingContext` | `Record<string, string \| number \| boolean>` | | Extra fields for the analytics `session_start` event |

Inputs may change after init: a new `manifest` / `manifestUrl` reloads the
work (position, non-persistent variables, open overlays and autoplay reset),
a new `entitlementSnapshot` re-evaluates the gates, and `locale`,
`viewModeOverride`, `showToolbar`, `reducedMotion`, `secondsPerPanel`,
`autoplay` and `themeOverride` apply live. The start position inputs,
`chapterScope` and `trackingContext` are read when a work (re)loads.

### Outputs

| Output | Payload | Fires when |
|---|---|---|
| `ready` | `void` | The manifest is loaded and the player is ready |
| `panelChange` | `PlayerPanelChangeEvent`: `{ panel, chapter, panelId, previousPanelId? }` | The reader moves to a new panel. `panelId` is the panel's key in `chapter.panels` (read the id from here: `panel.id` is optional in the format and usually absent); `previousPanelId` is the panel before it, unset for the first panel after a (re)load |
| `chapterChange` | `Chapter` | A chapter boundary is crossed |
| `chapterComplete` | `PlayerChapterCompleteEvent`: `{ chapterId, panelId, isLastChapter }` | The reader reaches the end of a chapter (once per visit) |
| `locationChange` | `PlayerLocation` | The reading position changes (cover, page, panel or canvas). Keep it in the address bar with `locationUrl()` and read it back with `parseLocationSearch()` |
| `variableChange` | `{ key, value }` | A story variable changes |
| `localeChange` | `LocaleCode` | The language is switched |
| `navigationAttempt` | `{ direction, target?, blocked? }` | Any navigation attempt, allowed or not; `blocked: 'outside-scope'` when a jump would leave `chapterScope` |
| `autoplayChange` | `boolean` | Autoplay is switched on or off |
| `widgetEvent` | `WidgetEvent` | The reader uses a content widget (`download`, `play` / `pause` / `ended`, `open` / `close`) |
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
  if the purchase or subscription is still missing. Age requirements combine
  across every rule that applies to a panel, so a chapter preview or a free
  panel rule never skips a work-wide age gate.
- **Buy / Subscribe:** the overlay offers a Buy option per product of a
  purchase rule (owning any one of them unlocks it) and a Subscribe option
  per tier of a subscription rule, next to Sign in and Maybe later. Each
  option takes its name, description and price from the matching
  `paywall.products` entry in the reader's language, else from the rule.
  `paywallAction` emits `{ action: 'purchase' | 'subscribe' | 'login' |
  'dismiss', gate, productId? }`; the options are also on `gate.options`.
- **After checkout:** call `refreshEntitlements(snapshot)` on the shell or
  pass a new `entitlementSnapshot`; the overlay closes once the reader is
  through. Story keys and swipes do nothing while the paywall or the age
  gate is open.
- **Custom `entitlementAdapter`:** it decides navigation, not rendering. A
  panel the adapter refuses still renders (on the initial load the paywall
  opens over it), so don't rely on an adapter to hide content: strip it on
  the server (`"x-locked": true`) or pass an `entitlementSnapshot`.

### Going further

**Theming.** Content widgets follow the work's `ui.theme` through
`--pw-theme-*` CSS custom properties. Override them on `pw-player-shell` from
your own CSS, or pass `themeOverride`.

**Chapter embeds.** To put one player per chapter on a course or article
page, load `embed/panelwave-embed.js` (also served at
`https://read.panelwave.org/embed.js`) and add a placeholder per chapter.
Attributes, events and the JS API are in
[MULTI_CHAPTER_EMBED.md](https://github.com/panelwave/player/blob/master/docs/MULTI_CHAPTER_EMBED.md).

**Services and building blocks.** The package also exports what the shell is
built from: `PlayerStateService` (observable reading state),
`VariableStoreService`, `FlowEngineService`, `TranslationService`,
`AudioEngineService`, `BubbleVoiceService` (spoken lines),
`PluginHostService` (message bus for sandboxed plugin layers), the
`ComicBalloon` renderer with `mergeBalloonConfig`, and all manifest types.
The [API reference](https://github.com/panelwave/player/blob/master/docs/API.md)
lists every export; the [documentation](https://docs.panelwave.org/player/overview)
covers concepts and guides. Release notes are in the
[changelog](https://github.com/panelwave/player/blob/master/CHANGELOG.md).

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
