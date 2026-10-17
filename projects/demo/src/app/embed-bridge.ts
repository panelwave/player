/**
 * Embed bridge protocol v1 — the postMessage contract between a host page
 * (the CMS preview iframe) and the demo app in embed mode
 * (`/player/index.html?embed=1&origin=<host origin>`).
 *
 * Documented in docs/EMBED_PROTOCOL.md (player repo) and
 * panelwave-cms/docs/PLAYER_EMBED.md → "Bridge protocol v1".
 */
import type { PanelWaveManifest } from 'player';

/** Protocol version announced in `pw:hello`. */
export const EMBED_PROTOCOL_VERSION = 1;

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
}

/** Everything a `config` message may carry. */
export interface EmbedConfigData extends EmbedOptions {
  manifest?: PanelWaveManifest;
  locale?: string;
  /** Initial variable values keyed by variable id (seeded privileged at (re)start; diffed live otherwise). */
  variables?: Record<string, unknown>;
  /** The CMS entitlement simulator's tokens, e.g. ['premium', 'purchased:prod-1', 'age-verified']. */
  entitlements?: string[];
  /** Position to open at (restart only). */
  initialPanelId?: string;
  /** View to open in (restart only). */
  initialViewMode?: string;
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
  | { type: 'restart' };

const INBOUND_TYPES = new Set<EmbedInboundMessage['type']>([
  'config',
  'navigate',
  'setVariable',
  'setLocale',
  'setEntitlements',
  'setOptions',
  'getState',
  'restart',
]);

/** Snapshot the demo posts as `pw:state`. */
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
 * The host origin the demo talks to: `?origin=` when it names a valid origin
 * (a cross-origin host must pass it), else the fallback — the demo's own
 * origin, which is where the CMS serves `/player/` from. Never `'*'`.
 */
export function hostOriginFromSearch(search: string, fallback: string): string {
  const raw = new URLSearchParams(search).get('origin');
  if (!raw) {
    return fallback;
  }
  try {
    const origin = new URL(raw).origin;
    return origin && origin !== 'null' ? origin : fallback;
  } catch {
    return fallback;
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
