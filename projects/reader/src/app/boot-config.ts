import { isDevMode } from '@angular/core';
import {
  normalizeOrigin,
  parseBridgeNonce,
  parseChannelKey,
  parseChapterRef,
  parseEmbedFlag,
  parseListingId,
  parsePurchaseUi,
  parseSecondsPerPanel,
  type PurchaseUiPolicy,
} from 'player';

/**
 * `read`: the public reader (anonymous; paywall and age gates apply).
 * `review`: a review link — paid parts open, age gates still ask.
 */
export type ReaderMode = 'read' | 'review';

export interface ReaderBootConfig {
  manifestUrl: string;
  embed: boolean;
  mode: ReaderMode;
  locale?: string;
}

/**
 * Chapter-embed options (docs/MULTI_CHAPTER_EMBED.md): the reader server
 * injects them into `__PW_READER__`; without that they are read from the
 * page's own URL (`?chapter=&autoplay=&toolbar=&cover=&spp=&origin=`) —
 * display options only, so this works in production builds too.
 */
export interface ReaderEmbedOptions {
  /** Play only this chapter (manifest id or CMS chapter uuid). */
  chapter?: string;
  autoplay?: boolean;
  showToolbar?: boolean;
  showCover?: boolean;
  secondsPerPanel?: number;
  /** Origin of the page that frames the reader (the only one the bridge talks to). */
  embedOrigin?: string;
  /**
   * Embed protocol v4: the channel the frame runs in and its listing. Only
   * from the reader server (it checks that the work is live on that channel),
   * never from the URL: analytics count reads per channel.
   */
  channel?: string;
  listing?: string;
  /** v4 `track=0|1`: analytics in this frame (false = privacy mode, nothing is sent). */
  track?: boolean;
  /** v4 `pui=`: purchase UI policy. */
  purchaseUi?: PurchaseUiPolicy;
  /** v4 `bridge=`: nonce of the port handshake. */
  bridgeNonce?: string;
}

declare global {
  interface Window {
    __PW_READER__?: Partial<ReaderBootConfig> & Partial<Record<keyof ReaderEmbedOptions, unknown>>;
  }
}

/** Embed options: injected values win, the URL fills the rest; absent keys stay absent. */
export function readEmbedOptions(win: Window): ReaderEmbedOptions {
  const injected = (win.__PW_READER__ ?? {}) as Record<string, unknown>;
  const params = new URLSearchParams(win.location.search);
  const flag = (key: string, param: string): boolean | undefined =>
    typeof injected[key] === 'boolean' ? (injected[key] as boolean) : parseEmbedFlag(params.get(param));
  const out: ReaderEmbedOptions = {};
  const chapter = parseChapterRef(injected['chapter']) ?? parseChapterRef(params.get('chapter'));
  if (chapter) out.chapter = chapter;
  const autoplay = flag('autoplay', 'autoplay');
  if (autoplay !== undefined) out.autoplay = autoplay;
  const showToolbar = flag('showToolbar', 'toolbar');
  if (showToolbar !== undefined) out.showToolbar = showToolbar;
  const showCover = flag('showCover', 'cover');
  if (showCover !== undefined) out.showCover = showCover;
  const seconds = parseSecondsPerPanel(injected['secondsPerPanel']) ?? parseSecondsPerPanel(params.get('spp'));
  if (seconds !== undefined) out.secondsPerPanel = seconds;
  const origin =
    normalizeOrigin(typeof injected['embedOrigin'] === 'string' ? injected['embedOrigin'] : null) ??
    normalizeOrigin(params.get('origin'));
  if (origin) out.embedOrigin = origin;
  // v4 channel context: the server's word only.
  const channel = parseChannelKey(injected['channel']);
  if (channel) {
    out.channel = channel;
    const listing = parseListingId(injected['listing']);
    if (listing) out.listing = listing;
  }
  const track = flag('track', 'track');
  if (track !== undefined) out.track = track;
  const purchaseUi = parsePurchaseUi(injected['purchaseUi']) ?? parsePurchaseUi(params.get('pui'));
  if (purchaseUi) out.purchaseUi = purchaseUi;
  const nonce = parseBridgeNonce(injected['bridgeNonce']) ?? parseBridgeNonce(params.get('bridge'));
  if (nonce) out.bridgeNonce = nonce;
  return out;
}

/**
 * Boot config injected by the reader server as `window.__PW_READER__`.
 * Dev-mode-only fallback (no server): `?manifest=<url>&embed=1&locale=&mode=review`;
 * production builds ignore the query string. Without either the
 * result has an empty `manifestUrl`.
 */
export function readBootConfig(win: Window, opts: { allowQuery?: boolean } = {}): ReaderBootConfig {
  const allowQuery = opts.allowQuery ?? isDevMode();
  const injected = win.__PW_READER__;
  if (injected && typeof injected.manifestUrl === 'string' && injected.manifestUrl) {
    return {
      manifestUrl: injected.manifestUrl,
      embed: injected.embed === true,
      mode: injected.mode === 'review' ? 'review' : 'read',
      ...(injected.locale ? { locale: injected.locale } : {}),
    };
  }
  if (!allowQuery) {
    return { manifestUrl: '', embed: false, mode: 'read' };
  }
  const params = new URLSearchParams(win.location.search);
  const manifestUrl = params.get('manifest') ?? '';
  return {
    manifestUrl,
    embed: params.get('embed') === '1',
    mode: params.get('mode') === 'review' ? 'review' : 'read',
    ...(params.get('locale') ? { locale: params.get('locale') as string } : {}),
  };
}
