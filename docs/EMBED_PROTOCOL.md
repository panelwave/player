# Embed bridge protocol v4

Three player pages speak this protocol with the page that frames them:

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
`widgetEvent` event (content widget layers). **v4** (channels, backward
compatible) adds the channel context, a MessagePort handshake that also works
for app hosts (Capacitor / Ionic on iOS), privacy mode, `progress`,
`restore`, `resize`, `fullscreenRequest` and the purchase UI policy — see
[Protocol 4](#protocol-4) below. `pw:hello` reports `protocol: 4` and, from v4
on, the `capabilities` the page offers; read them rather than the number. The
demo app (CMS preview) announces `capabilities: []`: it speaks the v3 set.

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
| `{ type: 'pw:hello', protocol: 4, channel, listing, capabilities }` | On load, before any config (and again over the port after `pw:connect`). `channel` / `listing` are the v4 channel context or `null`; `capabilities` (v4) lists what the page offers: `port`, `progress`, `restore`, `resize`, `privacy`, `purchaseUi`, `fullscreenRequest`. A v1–v3 page sends `{ type, protocol }` only. |
| `{ type: 'pw:ready' }` | The shell's `ready` output: the work is loaded and positioned. |
| `{ type: 'pw:event', name, data }` | Every shell output: `ready`, `panelChange`, `chapterChange`, `chapterComplete` (v2), `autoplayChange` (v2), `widgetEvent` (v3), `fullscreenRequest` (v4), `locationChange`, `variableChange`, `localeChange`, `navigationAttempt`, `cameraChange`, `paywallAction`, `ageVerified`, `likeChange`, `bookmarkChange`, `error`; and from the bridge `progress` and `resize` (v4). |
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
| `{ type: 'setPrivacy', tracking }` | v4: analytics on (`true`) or off (`false`) in this frame, e.g. after the host's own consent step. See privacy mode. |
| `{ type: 'restore', panelId, variables? }` | v4: continue where the host says — variables are seeded first, then the player jumps; waits for `ready` when sent earlier. Same as `config.resume`. |
| `{ type: 'purchaseHandled', productId? }` | v4: the host took over a purchase after `paywallAction` (its own checkout). The fallback to PanelWave's hosted checkout follows with reader purchases; until then the message is only handed to the app. |

### `config`

```ts
{ type: 'config', data: {
  manifest?, locale?, variables?, entitlements?,
  autoplay?, muted?, viewMode?, pageFormat?, secondsPerPanel?, showCover?, reducedMotion?,
  initialPanelId?, initialViewMode?, restart?,
  chapterScope?, showToolbar?,         // v2
  resume?, purchaseUi?, hostFullscreen? // v4
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
| `purchaseUi` (v4: `in_place` / `link_out` / `hidden`) | `purchaseUi` | live |
| `hostFullscreen` (v4) | `hostFullscreen` | live: where the browser has no Fullscreen API (WebViews), the fullscreen button stays and emits `fullscreenRequest` |

Note: `autoplay` and `viewMode` are input bindings; if the reader changed
them inside the player (keyboard shortcut), re-posting the same value is a
no-op. `setLocale` is immune (it also calls the shell directly).

## Protocol 4

Design source: panelwave-cms `docs/channel-manager/06_PLAYER_CHANNEL_SDK.md` §3.

### Boot parameters (reader and standalone pages)

| Parameter | Meaning |
|---|---|
| `bridge=<nonce>` | 16–128 URL-safe characters, random per mount. Enables the port handshake. |
| `track=0` / `track=1` | Analytics in this frame. `0` = privacy mode. |
| `pui=in_place` / `link_out` / `hidden` | Purchase UI policy. |
| `ch=<channelKey>`, `lid=<listingId>` | The channel the frame runs in. **Reader only, and only through the reader server**, which checks that the work is live on that channel and injects the value; a channel in the page's own URL is ignored, so nobody else can attribute reads to a channel. The standalone page never has a channel. |

The reader puts `channel` and `listing` into the analytics `session_start`
(next to `embedHost`) and into `pw:hello`.

### Port handshake

1. The host creates the frame with `?embed=1&bridge=<nonce>`.
2. After the frame's `load`, the host posts
   `{ type: 'pw:connect', nonce, protocol: 4 }` with one `MessagePort` in the
   transfer list — target origin `*` is fine: the nonce, not the origin, binds
   the port.
3. The page accepts the **first** `pw:connect` whose nonce matches its boot
   parameter and carries a port. It records the sender's origin (diagnostics
   only), answers `pw:hello` over the port — and `pw:ready` when the work is
   already loaded — and from then on talks **only over the port**: window
   messages are ignored, a second `pw:connect` is refused.
4. All messages of this document flow over the port in both directions.

Without `bridge=` the page speaks the window path as in v3 (origin-checked
`postMessage`). `normalizeOrigin()` accepts `capacitor://localhost` and
`ionic://localhost` as they are, but `postMessage` cannot target such
origins: app hosts use the port.

### Privacy mode

`track=0` (or `setPrivacy { tracking: false }`) turns `TrackingService` into
privacy mode: no event is queued, no beacon or request leaves the frame. The
`session_start` is held in memory only; `setPrivacy { tracking: true }` sends
it (with the time of the opt-in); events from before are not recovered.
Without `track` the work's own consent setting applies as before. Autoplay
stays off unless the host passes `autoplay=1`; sound needs `hostGesture`.

### `progress` and `restore`

`pw:event progress` — at most every 2 s after the position moved (panel,
chapter, location, chapter end) and at once on `pagehide`:

```ts
{ chapterId, chapterUuid, panelId, pageId, percent, variables, completed }
```

`percent` is the share (0–100) of the chapter's reachable panels (graph walk
from its entry) seen on this visit; a branching work has no single length, so
the share follows the reader's own path. Reaching the chapter's end counts as
100. A host that keeps the position for readers without an account sends it
back with `restore` or `config.resume`.

### `resize`

`pw:event resize { aspect, minHeight }` after `ready` and whenever the view's
shape changes: `aspect` = width / height of the current page in page view,
else of the active page format, else 16:9; `minHeight` = 320 (CSS px). The
host sizes the frame from it.

### Purchase UI policy

| `pui` | Paywall overlay |
|---|---|
| `in_place` (default) | Purchase options and sign-in; `paywallAction` reaches the host as before |
| `link_out` | "Available at {reader host}" with one neutral link to the work (the reader page's own address); no prices, no buttons. Without a usable link it behaves like `hidden`. |
| `hidden` | "Not available in this app"; no price, no link |

Decided for app hosts until legal advice exists: `hidden` on iOS, `link_out`
on Android.

### Not in this version yet

`setReaderToken` / `clearReaderToken`, `entitlementChange`,
`readerTokenExpiring` and `checkoutReturn` come with reader accounts and
checkout (channel manager docs 05 and 08); `pw:hello` does not announce them
until they work.

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
