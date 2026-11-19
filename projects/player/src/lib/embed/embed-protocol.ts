/**
 * Embed bridge protocol — the postMessage contract between a host page and a
 * player page running in an iframe (`?embed=1&origin=<host origin>`): the
 * CMS preview (demo app), chapter embeds driven by the embed loader (reader
 * and standalone apps).
 *
 * v1 (player 1.7): config / navigate / setVariable / setLocale /
 * setEntitlements / setOptions / getState / restart; pw:hello / pw:ready /
 * pw:event / pw:state.
 * v2 (player 1.9, backward compatible): `chapterScope` and `showToolbar` in
 * `config`, `showToolbar` in `setOptions`, inbound `hostGesture`, the
 * `chapterComplete` and `autoplayChange` events, and `chapterScope` /
 * `chapterComplete` / `autoplayActive` in `pw:state`.
 * v3 (player 1.10, backward compatible): inbound `setTheme` (live widget
 * theme on top of the manifest's `ui.theme`, `null` clears it) and the
 * `widgetEvent` event (content widget layers).
 * v4 (channels, backward compatible): channel context (`ch`, `lid`, `track`,
 * `pui`, `bridge` boot parameters), the MessagePort handshake (`pw:connect`)
 * for every host including app schemes, `pw:hello` with `capabilities`,
 * inbound `setPrivacy` / `restore` / `purchaseHandled`, the events `progress`,
 * `resize`, `fullscreenRequest`, and the purchase UI policy. Reader tokens
 * (`setReaderToken`) follow with reader accounts and are not announced yet.
 *
 * Documented in docs/EMBED_PROTOCOL.md and docs/MULTI_CHAPTER_EMBED.md.
 */
import type { PanelWaveManifest, UITheme } from '../types';

/** Protocol version announced in `pw:hello`. */
export const EMBED_PROTOCOL_VERSION = 4;

/** What a v4 frame offers, announced in `pw:hello.capabilities`. */
export type EmbedCapability = 'port' | 'progress' | 'restore' | 'resize' | 'privacy' | 'purchaseUi' | 'fullscreenRequest';

export const EMBED_CAPABILITIES: readonly EmbedCapability[] = ['port', 'progress', 'restore', 'resize', 'privacy', 'purchaseUi', 'fullscreenRequest'];

/** `progress` is posted at most once per this many ms (and at once on `pagehide`). */
export const EMBED_PROGRESS_DEBOUNCE_MS = 2000;

/** Smallest height (CSS px) a host should give the frame; sent with `resize`. */
export const EMBED_MIN_HEIGHT = 320;

/**
 * Purchase UI policy (`pui`): `in_place` shows the paywall with its options;
 * `link_out` one neutral link to the work on the reader site, no prices;
 * `hidden` a lock without price or link (app hosts under store rules).
 */
export type PurchaseUiPolicy = 'in_place' | 'link_out' | 'hidden';

/**
 * Origins of app hosts whose pages are not http(s) (Capacitor / Ionic on iOS).
 * Accepted by `normalizeOrigin()` as they are; the port handshake is the
 * reliable path for them, as `postMessage` cannot target such an origin.
 */
export const APP_HOST_ORIGINS: readonly string[] = ['capacitor://localhost', 'ionic://localhost'];

/** Live state: how many panel ids the `history` carries at most. */
export const EMBED_HISTORY_LIMIT = 50;

/** Live state: how many error messages are kept. */
export const EMBED_ERROR_LIMIT = 20;

/** Options a host can change while the story runs (`setOptions`). */
export interface EmbedOptions {
  autoplay?: boolean;
  muted?: boolean;
  /** 'auto' | 'panel' | 'canvas' — the shell's `viewModeOverride`. */
  viewMode?: string;
  /** Page format id or 'auto' — the shell's `pageFormat`. */
  pageFormat?: string;
  secondsPerPanel?: number;
  /** Read at (re)start only; `false` also drops a visible cover live. */
  showCover?: boolean;
  reducedMotion?: boolean;
  /** Toolbar visible (v2). */
  showToolbar?: boolean;
  /** v4: purchase UI policy. */
  purchaseUi?: PurchaseUiPolicy;
  /** v4: the host can enlarge the frame itself; the fullscreen button then asks it (`fullscreenRequest`) where the browser cannot. */
  hostFullscreen?: boolean;
}

/** v4: where to start or continue (`config.resume`, `restore`). */
export interface EmbedResume {
  panelId: string;
  /** Variable values keyed by variable id, seeded before the jump. */
  variables?: Record<string, unknown>;
}

/** v4: the `progress` event. */
export interface EmbedProgress {
  chapterId: string | null;
  /** CMS chapter uuid when the manifest carries it. */
  chapterUuid: string | null;
  panelId: string | null;
  pageId: string | null;
  /** Share (0–100) of the chapter's reachable panels seen on this visit. */
  percent: number;
  variables: Record<string, unknown>;
  /** The chapter's end was reached on this visit. */
  completed: boolean;
}

/** v4: the `resize` event — the shape the frame wants. */
export interface EmbedResize {
  /** Width / height of the current view. */
  aspect: number;
  minHeight: number;
}

/** Everything a `config` message may carry. */
export interface EmbedConfigData extends EmbedOptions {
  manifest?: PanelWaveManifest;
  locale?: string;
  /** Initial variable values keyed by variable id (seeded privileged at (re)start; diffed live otherwise). */
  variables?: Record<string, unknown>;
  /** Entitlement tokens, e.g. ['premium', 'purchased:prod-1', 'age-verified']. */
  entitlements?: string[];
  /** Position to open at (restart only). */
  initialPanelId?: string;
  /** View to open in (restart only). */
  initialViewMode?: string;
  /** Play only this chapter (restart only, v2). */
  chapterScope?: string;
  /** Force a restart even when the manifest is unchanged. */
  restart?: boolean;
  /** v4: where to start (applied once the work is ready). */
  resume?: EmbedResume;
  [key: string]: unknown;
}

export type EmbedInboundMessage =
  | { type: 'config'; data: EmbedConfigData }
  | { type: 'navigate'; panelId: string }
  | { type: 'setVariable'; key: string; value: unknown }
  | { type: 'setLocale'; locale: string }
  | { type: 'setEntitlements'; entitlements?: string[] | string | null }
  | { type: 'setOptions'; data: EmbedOptions }
  | { type: 'getState' }
  | { type: 'restart' }
  | { type: 'hostGesture' }
  | { type: 'setTheme'; theme: UITheme | null }
  | { type: 'setPrivacy'; tracking: boolean }
  | { type: 'restore'; panelId: string; variables?: Record<string, unknown> }
  | { type: 'purchaseHandled'; productId?: string };

const INBOUND_TYPES = new Set<EmbedInboundMessage['type']>([
  'config',
  'navigate',
  'setVariable',
  'setLocale',
  'setEntitlements',
  'setOptions',
  'getState',
  'restart',
  'hostGesture',
  'setTheme',
  'setPrivacy',
  'restore',
  'purchaseHandled',
]);

/** v4: the port handshake message (host → frame, with one MessagePort in the transfer list). */
export interface EmbedConnectMessage {
  type: 'pw:connect';
  nonce: string;
  protocol?: number;
}

/** The message is a `pw:connect` with a nonce (the port is checked by the bridge). */
export function isEmbedConnectMessage(data: unknown): data is EmbedConnectMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { type?: unknown }).type === 'pw:connect' &&
    typeof (data as { nonce?: unknown }).nonce === 'string'
  );
}

/** Snapshot posted as `pw:state`. */
export interface EmbedStateSnapshot {
  chapterId: string | null;
  pageId: string | null;
  panelId: string | null;
  /** 'cover' | 'panel' | 'page' | 'canvas', null before the shell exists. */
  viewMode: string | null;
  locale: string;
  /** The host's entitlement tokens as last given; null = anonymous reader. */
  entitlements: string[] | null;
  /** Flat variable context (global + session + persistent + current chapter/page). */
  variables: Record<string, unknown>;
  /** Visited panels in reading order (last 50, oldest first); the current one is `panelId`. */
  history: string[];
  /** Targets of the current panel's outgoing edges (conditions not evaluated). */
  nextPanels: { panelId: string; title?: string }[];
  paywallGate: unknown | null;
  preloadStatus: { queued: number; loading: number; loaded: number; maxConcurrent: number } | null;
  /** Last 20 error messages since the last (re)start, oldest first. */
  errors: string[];
  /** Manifest handed over → shell `ready`, in ms; null until ready. */
  loadTimeMs: number | null;
  /** v2: manifest id of the chapter the player is locked to, null without a scope. */
  chapterScope: string | null;
  /** v2: the current chapter's end has been reached on this visit. */
  chapterComplete: boolean;
  /** v2: autoplay is on and running (not suspended off screen). */
  autoplayActive: boolean;
}

/** `pw:hello` (v4 adds the channel context and capabilities). */
export interface EmbedHello {
  type: 'pw:hello';
  protocol: number;
  channel?: string | null;
  listing?: string | null;
  capabilities?: readonly EmbedCapability[];
}

export type EmbedOutboundMessage =
  | EmbedHello
  | { type: 'pw:ready' }
  | { type: 'pw:event'; name: string; data: unknown }
  | { type: 'pw:state'; data: EmbedStateSnapshot };

/** The message is one of the protocol's inbound shapes (by `type` only; fields are checked by the handlers). */
export function isEmbedInboundMessage(data: unknown): data is EmbedInboundMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    typeof (data as { type?: unknown }).type === 'string' &&
    INBOUND_TYPES.has((data as { type: EmbedInboundMessage['type'] }).type)
  );
}

/**
 * The host origin the player talks to: `?origin=` when it names a valid
 * origin (a cross-origin host must pass it), else the fallback — the page's
 * own origin, which is right for a same-origin host. Never `'*'`.
 */
export function hostOriginFromSearch(search: string, fallback: string): string {
  const raw = new URLSearchParams(search).get('origin');
  return normalizeOrigin(raw) ?? fallback;
}

/**
 * `https://a.example/x?y` → `https://a.example`; the app host origins
 * (`capacitor://localhost`, `ionic://localhost`) as they are; null for
 * anything else.
 */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const app = raw.trim().toLowerCase().replace(/\/+$/, '');
  if (APP_HOST_ORIGINS.includes(app)) {
    return app;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin && url.origin !== 'null' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Cheap identity of a manifest for "did the work change?" — a djb2 hash over
 * its JSON plus the length. Hosts re-post the full config on every control
 * change; an unchanged manifest must not restart the story.
 */
export function manifestFingerprint(manifest: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(manifest) ?? '';
  } catch {
    json = String(Date.now());
  }
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  }
  return `${json.length}:${hash >>> 0}`;
}

/** Deep-ish equality for variable values (JSON-representable by contract). */
export function sameVariableValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** A localized string in the given locale, else en-US, else the first value. */
export function pickLocalized(value: Record<string, string> | undefined, locale: string): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value[locale] ?? value['en-US'] ?? Object.values(value)[0];
}

/**
 * Parse an embed URL flag: `1` / `true` / `yes` → true, `0` / `false` / `no`
 * → false, anything else (or absent) → undefined.
 */
export function parseEmbedFlag(value: string | null | undefined): boolean | undefined {
  if (value == null) {
    return undefined;
  }
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') {
    return true;
  }
  if (v === '0' || v === 'false' || v === 'no') {
    return false;
  }
  return undefined;
}

/** A chapter reference from a URL / config: manifest id or uuid, else undefined. */
export function parseChapterRef(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : undefined;
}

/** v4: a channel key (`ch=`), else undefined. */
export function parseChannelKey(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(value) ? value : undefined;
}

/** v4: a listing id (`lid=`, a uuid), else undefined. */
export function parseListingId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : undefined;
}

/** v4: a purchase UI policy (`pui=`), else undefined. */
export function parsePurchaseUi(value: unknown): PurchaseUiPolicy | undefined {
  return value === 'in_place' || value === 'link_out' || value === 'hidden' ? value : undefined;
}

/** v4: a bridge nonce (`bridge=`, 16–128 URL-safe characters), else undefined. */
export function parseBridgeNonce(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : undefined;
}

/** v4: a `resume` / `restore` payload, else undefined. */
export function parseResume(value: unknown): EmbedResume | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as { panelId?: unknown; variables?: unknown };
  if (typeof v.panelId !== 'string' || !v.panelId) return undefined;
  const variables = v.variables && typeof v.variables === 'object' && !Array.isArray(v.variables) ? (v.variables as Record<string, unknown>) : undefined;
  return variables ? { panelId: v.panelId, variables } : { panelId: v.panelId };
}

/** Seconds per panel from a URL / config (0.5–120), else undefined. */
export function parseSecondsPerPanel(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0.5 && n <= 120 ? n : undefined;
}
