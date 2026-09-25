# @panelwave/player — API reference

Everything a host application can import from `@panelwave/player`. The
full manifest format is documented in the schema repo; the reader-facing
behaviour of each feature is on docs.panelwave.org → Player.

Everything listed here is exported from `projects/player/src/public-api.ts`.
Anything not exported there is internal and may change without notice.

## `<pw-player-shell>` — `PlayerShellComponent`

The one component most hosts need. It loads a manifest, renders the current
panel/page/canvas, owns the toolbar and every modal, and turns the manifest's
rules (graph, variables, paywall, tracking) into behaviour.

```html
<pw-player-shell
  [manifestUrl]="'https://cdn.example.com/works/abc/manifest.json'"
  [locale]="'de-DE'"
  [showToolbar]="true"
  [entitlementSnapshot]="snapshot"
  (paywallAction)="onPaywall($event)"
  (panelChange)="onPanel($event)">
</pw-player-shell>
```

### Inputs

| Input | Type | Default | Purpose |
|-------|------|---------|---------|
| `manifest` | `PanelWaveManifest` | — | Manifest object to play. |
| `manifestUrl` | `string` | — | URL to fetch the manifest from (alternative to `manifest`). |
| `locale` | `LocaleCode` | `'en-US'` | Initial UI + content locale; the toolbar can switch it. |
| `initialChapterId` | `string` | — | Start position (chapter). |
| `initialPanelId` | `string` | — | Start position (panel). Without both, the reader's device bookmark is resumed, else the graph entry. |
| `initialVariables` | `Record<string, unknown>` | — | Host-seeded variable values (may seed `readOnly` variables, e.g. a verified age). |
| `autoplay` | `boolean` | `false` | Start in autoplay. |
| `secondsPerPanel` | `number` | `5` | Autoplay pace. |
| `reducedMotion` | `boolean` | `false` | Force reduced motion (also honours the OS setting). |
| `showToolbar` | `boolean` | `false` | Toolbar visible on load (`T` toggles it). |
| `viewModeOverride` | `'auto' \| 'panel' \| 'canvas'` | `'auto'` | Force a view mode; `auto` follows the manifest. |
| `entitlementAdapter` | `EntitlementAdapter` | — | Host object answering `hasAccess(panelId)` / `getContext()` / `purchase?()`. Wins over manifest rules. |
| `entitlementSnapshot` | `EntitlementSnapshot` | — | What the reader owns (subscription tier, purchased products, verified age). Enables the manifest's `paywall.rules`. |
| `entitlementEndpoint` | `string` | — | URL returning the snapshot (`{workId}` substituted) when the host prefers the player to fetch it. |
| `readerToken` | `string` | — | Bearer token sent to `entitlementEndpoint`. |

### Outputs

| Output | Payload | When |
|--------|---------|------|
| `ready` | `void` | Manifest loaded and the initial panel is on screen. |
| `panelChange` | `{ panel: Panel; chapter: Chapter }` | The current panel changed. |
| `chapterChange` | `Chapter` | The current chapter changed. |
| `navigationAttempt` | `{ direction: 'next' \| 'previous' \| 'panel'; target?: string }` | Before a navigation is resolved (also when it is blocked). |
| `localeChange` | `LocaleCode` | The reader switched the locale. |
| `variableChange` | `{ key: string; value: unknown }` | A variable value changed. |
| `cameraChange` | `CameraState` | Canvas view: the camera moved. |
| `paywallAction` | `{ action: PaywallAction; gate: PaywallGate }` | The reader acted on the paywall overlay (checkout belongs to the host). |
| `ageVerified` | `AgeVerificationResult` | The reader answered an age gate. |
| `likeChange` | `{ workId: string; liked: boolean }` | Like toggled (persisted on the device). |
| `bookmarkChange` | `{ workId, chapterId, panelId, bookmarked }` | Bookmark set/cleared (persisted on the device, resumed on load). |
| `error` | `Error` | Load or navigation failure. |

### Methods

`refreshEntitlements(snapshot?)` — re-check access after the host reports a
completed purchase; drops the paywall when the gated panel is now accessible.

### Device-local state

The shell keeps three keys in `localStorage`: `pw-preferences` (toggles the
reader set explicitly), `pw-social` (per-work like + bookmark) and
`pw-age-verified`. All are optional — the player works without storage.

## Other components

| Component | Selector | Purpose |
|-----------|----------|---------|
| `SpeechBubblesComponent` | `pw-speech-bubbles` | Renders a panel's bubbles with the ComicBalloon SVG engine. |
| `HotspotsOverlayComponent` | `pw-hotspots-overlay` | Interactive hotspot shapes (all five actions). |
| `VideoLayerComponent` | `pw-video-layer` | Video layer with play/start modes, sequencing hooks. |
| `PaywallOverlayComponent` | `pw-paywall-overlay` | Purchase / subscription gate UI (`gate`, `visible`; `action`, `close`). |
| `AgeGateComponent` | `pw-age-gate` | Birth-date age check (`minimumAge`, `allowDismiss`; `verify`, `close`). |
| `BranchChooserComponent` | `pw-branch-chooser` | Lists selectable outgoing edges (`choices`; `choose`, `close`). |
| `ActionModalComponent` | `pw-action-modal` | Localized title + text dialog (hotspot `openModal`). |
| `PluginSandboxComponent` | `pw-plugin-sandbox` | Sandboxed iframe host for plugin layers. |
| `PwIconComponent` | `pw-icon` | Inline Lucide icon by name. |

Every modal follows the same contract: `visible` input, `close` output,
Escape and backdrop click close it.

## Services

All services are `providedIn: 'root'` unless noted.

| Service | What it owns |
|---------|--------------|
| `ManifestService` | Loading (`loadManifestFromUrl`, `loadManifestFromObject`), indexes, `getManifest()`, `getChapter()`. |
| `FlowEngineService` | Graph traversal: `getNextPanel`, `getPreviousPanels`, `getEntry`, `findPath`, reachability, edge transitions and camera moves. |
| `VariableStoreService` | Variables in five scopes, definitions, `applyMutations`, `createContext` for JSON Logic. |
| `PaywallService` | Manifest `paywall.rules` evaluation: `evaluate`, `canAccess`, `gateFor`, `ruleFor`, snapshot. |
| `EntitlementService` | Adapter-based entitlement (legacy path, used when a host adapter is set). |
| `PlayerStateService` | Current panel/chapter/locale, reader preferences (`preferences$`, `updatePreference`). |
| `TrackingService` | `track(type, data)`, consent + whitelist, endpoint batching. |
| `AudioEngineService` | WebAudio buses (music/sfx/voiceover), master/role mute, fades. |
| `PanelAudioService` | Plays `panel.audio` tracks on enter/leave (internal, not exported). |
| `VideoControllerService` | Single-active-video policy, play/pause state. |
| `VisibilityService` | IntersectionObserver-based panel visibility (page view). |
| `PreloadService` | Prefetch queue with priorities and network awareness. |
| `ImageCacheService` | Decoded image cache with a memory budget. |
| `HotspotActionService` | Executes hotspot actions, returns UI effects. |
| `PluginHostService` | Message bus for sandboxed plugins. |
| `ExportService` | PDF/EDL/JSON export helpers from a manifest. |
| `TranslationService` | UI string translation (ngx-translate wrapper). |
| `UserGestureService` | Tracks the first user gesture (autoplay policies). |
| `CanvasCameraService` | Canvas-view camera state (provided by the shell). |

## Types

`export * from './lib/types'` — every manifest interface (`PanelWaveManifest`,
`Chapter`, `Page`, `Panel`, `Layer` kinds, `Edge`, `Graph`, `Hotspot`,
`SpeechBubble`, `PaywallRule`, `VariableDefinition`, …), the entitlement types
(`EntitlementSnapshot`, `PaywallGate`, `EntitlementAdapter`) and player events.
The interfaces mirror `@panelwave/types` for schema 1.5.

## Versioning

Semver on the library. Inputs, outputs, exported services and their public
methods are the API surface; template class names are not (style hooks are
the CSS custom properties documented on the docs site).
