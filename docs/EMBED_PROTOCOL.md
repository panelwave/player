# Embed bridge protocol v2

Three player pages speak this `postMessage` protocol with the page that
frames them:

- the **demo app** (`projects/demo`) — the **CMS preview embed**: the CMS
  serves its build same-origin at `/player/index.html` and drives it,
  manifest included, through `config`;
- the **reader app** (`projects/reader`, read.panelwave.org) and
- the **standalone page** (`projects/standalone`, self-hosted packages) —
  the **chapter embeds** of [MULTI_CHAPTER_EMBED.md](MULTI_CHAPTER_EMBED.md):
  they own their manifest; the host (normally the embed loader
  `panelwave-embed.js`) controls options, autoplay and navigation.

Protocol v1 (player 1.7) made the bridge two-way and stopped restarting the
story on every control change. **v2 (player 1.9) is backward compatible**:
`config.chapterScope` / `showToolbar`, `setOptions.showToolbar`, the inbound
`hostGesture`, the `chapterComplete` and `autoplayChange` events and three
`pw:state` fields. **v3 (player 1.10)** adds the inbound `setTheme` and the
`widgetEvent` event (content widget layers). `pw:hello` reports
`protocol: 3`.

Source (library, exported from `@panelwave/player`):
`projects/player/src/lib/embed/` — `embed-protocol.ts` (types, helpers),
`embed-state.service.ts` (the `pw:state` snapshot), `player-embed-bridge.ts`
(`PlayerEmbedBridge`, used by the reader and standalone apps). The demo keeps
its CMS-preview handlers (manifest restarts, variable diffing, entitlement
simulator) in `app.component.ts`. Tests: `player-embed-bridge.spec.ts`,
`embed-protocol.spec.ts`, demo `app.component.spec.ts` → "embed bridge".

## Loading the iframe

```
/player/index.html?embed=1&origin=<encodeURIComponent(parent origin)>                (CMS preview)
https://read.panelwave.org/<team>/<work>?embed=1&origin=…&chapter=<id|uuid>&autoplay=0  (chapter embed, hosted)
./course/index.html?embed=1&origin=…&chapter=<id|uuid>&autoplay=0                    (chapter embed, package)
```

Chapter-embed URL parameters (reader and standalone): `chapter` (manifest
chapter id or CMS chapter uuid → `chapterScope`), `autoplay`, `toolbar`,
`cover` (`1`/`0`), `spp` (seconds per panel, 0.5–120), `origin`. The
standalone page speaks the bridge only over http(s), never from `file://`.

- `embed=1` (or simply being framed) puts the app in embed mode: no demo
  chrome, no toolbar, no bundled sample — it waits for `config`.
- `origin` is the host page's origin (`window.location.origin`). The demo
  posts **only** to that origin (never `'*'`) and **ignores inbound messages
  whose `event.origin` differs**. Without `origin` it falls back to its own
  origin, which is what a same-origin embed (the CMS) needs; a cross-origin
  host must pass it, or nothing comes back.

## Outbound (iframe → host)

| Message | When |
|---------|------|
| `{ type: 'pw:hello', protocol: 1 }` | On load, before any config. Hosts that get it know the bridge speaks v1. |
| `{ type: 'pw:ready' }` | The shell's `ready` output: the work is loaded and positioned. |
| `{ type: 'pw:event', name, data }` | Every shell output: `ready`, `panelChange`, `chapterChange`, `chapterComplete` (v2), `autoplayChange` (v2), `widgetEvent` (v3), `locationChange`, `variableChange`, `localeChange`, `navigationAttempt`, `cameraChange`, `paywallAction`, `ageVerified`, `likeChange`, `bookmarkChange`, `error`. |
| `{ type: 'pw:state', data }` | In reply to `getState`, and ~100 ms (debounced) after `ready`, every navigation/event above (except `cameraChange`), every inbound change and every error. |

Event payloads are the shell's, except where the shell emits whole manifest
objects: `panelChange` → `{ panelId, previousPanelId, chapterId }`,
`chapterChange` → `{ chapterId, title }`, `error` → `{ message }`.

`pw:state.data`:

```ts
{
  chapterId: string | null,
  pageId: string | null,            // page view only
  panelId: string | null,
  viewMode: 'cover' | 'panel' | 'page' | 'canvas' | null,
  locale: string,
  entitlements: string[] | null,    // the host's tokens as last given
  variables: { [key]: value },      // flat context: global + session + persistent + current chapter/page
  history: string[],                // visited panels in reading order, last 50, oldest first
  nextPanels: { panelId, title? }[],// targets of the current panel's outgoing edges (conditions not evaluated)
  paywallGate: PaywallGate | null,  // the gate the overlay shows, else null
  preloadStatus: { queued, loading, loaded, maxConcurrent } | null,
  errors: string[],                 // last 20 since the last (re)start
  loadTimeMs: number | null,        // config received → ready
  chapterScope: string | null,      // v2: manifest id of the chapter the player is locked to
  chapterComplete: boolean,         // v2: the current chapter's end was reached on this visit
  autoplayActive: boolean           // v2: autoplay on and running (not suspended off screen)
}
```

`history` comes from the shell's visited list (the exported
`PlayerStateService` keeps no navigation history; the one in `state/` is an
unused copy) and `preloadStatus` from `PreloadService.getQueueStatus()`.

## Inbound (host → iframe)

| Message | Effect |
|---------|--------|
| `{ type: 'config', data }` | See below. The only message pre-v1 hosts send; still fully supported. |
| `{ type: 'navigate', panelId }` | Jump to any panel of the work (its chapter is resolved; a showing cover is left). Unknown ids land in `state.errors`. |
| `{ type: 'setVariable', key, value }` | `PlayerShellComponent.seedVariable()`: written into the definition's scope (read-only variables are seeded like `initialVariables`), conditional content reacts at once, `variableChange` fires. No restart. |
| `{ type: 'setLocale', locale }` | Content locale + GUI language, live. |
| `{ type: 'setEntitlements', entitlements }` | Tokens as in `config` (`basic`/`premium`/`pro`, `purchased:<productId>`, `age-verified`). The shell re-evaluates every gate live: a visible paywall closes when the reader now passes, locked placeholders unlock, extras re-lock. No restart. |
| `{ type: 'setOptions', data }` | Live shell inputs, see the table below. |
| `{ type: 'getState' }` | Replies with `pw:state` immediately. |
| `{ type: 'restart' }` | Same work from the start with the current config (locale, entitlements, options, last `variables`). Reader / standalone: `reload()` of the shell. |
| `{ type: 'setTheme', theme }` | v3: live widget theme (`UITheme`: `mode`, `colors`, `fonts`, `shape`, `density`) on top of the manifest's `ui.theme`; `theme: null` clears it. No restart. The CMS theme manager previews with it. |
| `{ type: 'hostGesture' }` | v2: the reader interacted with the host page. Marks the player's `UserGestureService` as interacted, so sound the browser's autoplay policy held back is retried (the iframe needs `allow="autoplay"`). |

### `config`

```ts
{ type: 'config', data: {
  manifest?, locale?, variables?, entitlements?,
  autoplay?, muted?, viewMode?, pageFormat?, secondsPerPanel?, showCover?, reducedMotion?,
  initialPanelId?, initialViewMode?, restart?,
  chapterScope?, showToolbar?          // v2
} }
```

The shell is **(re)created only** on the first manifest, when
`data.restart === true`, or when the manifest changed (a cheap fingerprint —
djb2 over its JSON — is compared; hosts may keep re-posting the full manifest
on every control change). Otherwise the config is applied live: `locale`,
`entitlements` and the options as above; `variables` are **diffed** against
the previous config — changed keys are written through `seedVariable`,
removed keys return to the definition's `default`. `initialPanelId` /
`initialViewMode` are read at (re)start only. A config without a manifest
only updates the settings (and the seed for the first load).

### Options: live or restart?

| Key | Shell input | Applied |
|-----|-------------|---------|
| `autoplay` | `autoplay` | live (toggles autoplay) |
| `muted` | — (`setAudioEnabled(!muted)`) | live, and again on every `ready`: the host's flag wins over the work default and the stored preference |
| `viewMode` (`auto`/`panel`/`canvas`) | `viewModeOverride` | live |
| `pageFormat` (id or `auto`) | `pageFormat` | live (page view re-picks the page set) |
| `secondsPerPanel` | `secondsPerPanel` | live (autoplay re-arms) |
| `reducedMotion` | `reducedMotion` | live |
| `showCover` | `showCover` | read at (re)start; `false` additionally drops a cover that is showing. `true` shows again only after `restart`. |
| `initialPanelId`, `initialViewMode` | `initialPanelId`, `initialViewMode` | restart only (`config` keys, not `setOptions`) |
| `chapterScope` (v2) | `chapterScope` | restart only (`config` key). Reader / standalone take it from the URL. |
| `showToolbar` (v2) | `showToolbar` | live |

Note: `autoplay` and `viewMode` are input bindings; if the reader changed
them inside the player (keyboard shortcut), re-posting the same value is a
no-op. `setLocale` is immune (it also calls the shell directly).

## Backward compatibility

A pre-v1 host that only posts `{ type: 'config', data }` with `'*'` keeps
working: same-origin messages are accepted without `?origin=`, the first
config creates the shell, later configs with the same manifest apply live
instead of restarting (previously every variable keystroke restarted the
story), and the host now also receives `pw:*` messages it may ignore.

## Analytics events the embedded player emits

For the CMS analytics worker (unchanged beacon, `TrackingService`):

| Event | Payload |
|-------|---------|
| `panel_view` | `panelId, chapterId, panelOrder` |
| `transition` | `fromPanelId, toPanelId, panelId (= to), chapterId` — one per move |
| `decision` | `panelId (= from), chapterId, fromPanelId, toPanelId, choiceId, choiceLabel, source: 'branch' \| 'hotspot', index?` (was `branch_choice`, which the schema whitelist dropped) |
| `hotspot_click` | `panelId, chapterId, hotspotId?, x, y, hit` |
| `paywall_view` | `panelId, chapterId, ruleId, scope, refId, lockReason, requireEntitlement` |
| `paywallAction` | same + `action ('purchase' \| 'subscribe' \| 'login' \| 'dismiss'), productId?` — **not in the schema `eventWhitelist` enum yet**; the CMS manifest filters it until schema + `ManifestBuilderService` add it (cms-api ingest accepts it) |
| `lang_change` | `from, to, panelId, chapterId` |
| `like` | `workId, liked, panelId, chapterId` |
| `bookmark` | `workId, chapterId, panelId, bookmarked` |
| `share` | `workId, channel ('copy' \| 'twitter' \| 'facebook' …), panelId, chapterId, url` — on the share dialog's copy/post, not on opening it |
