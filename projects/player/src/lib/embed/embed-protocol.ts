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
 *
 * Documented in docs/EMBED_PROTOCOL.md and docs/MULTI_CHAPTER_EMBED.md.
 */
import type { PanelWaveManifest, UITheme } from '../types';

/** Protocol version announced in `pw:hello`. */
export const EMBED_PROTOCOL_VERSION = 3;

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
  | { type: 'setTheme'; theme: UITheme | null };

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
]);

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

export type EmbedOutboundMessage =
  | { type: 'pw:hello'; protocol: number }
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

/** `https://a.example/x?y` → `https://a.example`; null for anything that is no http(s) origin. */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
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

/** Seconds per panel from a URL / config (0.5–120), else undefined. */
export function parseSecondsPerPanel(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0.5 && n <= 120 ? n : undefined;
}
