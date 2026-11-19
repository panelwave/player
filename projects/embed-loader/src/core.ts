/**
 * PanelWave embed loader / host SDK — pure logic (no DOM): reading an
 * element's or a `mount()` call's options, building the iframe URL, choosing
 * when to mount, deciding which iframes to unmount, the bridge nonce.
 * Unit-tested by scripts/embed-loader.test.mjs. See docs/MULTI_CHAPTER_EMBED.md
 * and docs/EMBEDDING.md.
 *
 * 2.0: whole-work mode (no chapter), `PanelWave.mount()`, channel / privacy /
 * purchase UI / theme options and the embed protocol 4 port handshake.
 */

export const LOADER_VERSION = '2.0.0';

/** `eager`: mount at once · `lazy`: when near the viewport · `auto`: first eager, rest lazy · `click`: on tap. */
export type LoadingStrategy = 'eager' | 'lazy' | 'auto' | 'click';

/** How far ahead of the viewport lazy instances mount. */
export const LAZY_ROOT_MARGIN = '800px 0px';

/** Default for how many iframes stay mounted at once (farther ones go back to their poster). */
export const DEFAULT_MAX_LIVE = 3;

export type PurchaseUi = 'in_place' | 'link_out' | 'hidden';

export interface EmbedElementOptions {
  /** Player page: the reader URL of a work, or a package's index.html (relative to the page). */
  src: string;
  /** Chapter: CMS chapter uuid (stable) or manifest chapter id. Absent = the whole work (2.0). */
  chapter?: string;
  /** 2.0: the channel the frame runs in (`?ch=`; the reader server checks it). */
  channel?: string;
  /** 2.0: analytics in the frame; false = privacy mode (`track=0`). Absent = the work's own setting. */
  track?: boolean;
  /** 2.0: purchase UI policy (`pui=`). */
  purchaseUi?: PurchaseUi;
  /** 2.0: `light` or `dark` widget theme, sent once the player is ready. */
  theme?: 'light' | 'dark';
  /** Start autoplay; the player plays only while it is at least half on screen. */
  autoplay: boolean;
  loading: LoadingStrategy;
  poster?: string;
  title?: string;
  /** CSS aspect-ratio value, e.g. `16 / 9`. */
  aspect: string;
  locale?: string;
  toolbar: boolean;
  cover: boolean;
  secondsPerPanel?: number;
  maxLive: number;
  /** Mute instances while they are off screen. */
  exclusiveAudio: boolean;
}

export type OptionsResult = { ok: true; options: EmbedElementOptions } | { ok: false; error: string };

const CHAPTER_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const CHANNEL_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const LOCALE_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** `true`/`1`/`yes`/'' → true, `false`/`0`/`no` → false, else the fallback. */
export function flag(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const v = value.trim().toLowerCase();
  if (v === '' || v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return fallback;
}

/** `16/9`, `4:3`, `1.5` → a CSS aspect-ratio value; anything else → `16 / 9`. */
export function parseAspect(value: string | null): string {
  const fallback = '16 / 9';
  if (!value) return fallback;
  const pair = value.trim().match(/^(\d+(?:\.\d+)?)\s*[/:x]\s*(\d+(?:\.\d+)?)$/);
  if (pair) {
    const w = Number(pair[1]);
    const h = Number(pair[2]);
    return w > 0 && h > 0 ? `${w} / ${h}` : fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : fallback;
}

/** Read an element's `data-*` options (`get('src')` → `data-src`). */
export function readOptions(get: (name: string) => string | null): OptionsResult {
  const src = (get('src') ?? '').trim();
  if (!src || /^\s*(javascript|data|vbscript):/i.test(src)) {
    return { ok: false, error: 'data-src is missing or not a page URL' };
  }
  const chapter = (get('chapter') ?? '').trim();
  // 2.0: without a chapter the frame shows the whole work.
  if (chapter && !CHAPTER_RE.test(chapter)) {
    return { ok: false, error: 'data-chapter is malformed' };
  }
  const channel = (get('channel') ?? '').trim();
  const pui = (get('purchase-ui') ?? '').trim();
  const theme = (get('theme') ?? '').trim();
  const track = get('track');
  const loadingRaw = (get('loading') ?? 'auto').trim().toLowerCase();
  const loading: LoadingStrategy =
    loadingRaw === 'eager' || loadingRaw === 'lazy' || loadingRaw === 'click' ? loadingRaw : 'auto';
  const locale = (get('locale') ?? '').trim();
  const seconds = Number(get('seconds-per-panel'));
  const maxLive = Math.floor(Number(get('max-live')));
  const poster = (get('poster') ?? '').trim();
  const title = (get('title') ?? '').trim();
  return {
    ok: true,
    options: {
      src,
      ...(chapter ? { chapter } : {}),
      ...(CHANNEL_RE.test(channel) ? { channel } : {}),
      ...(track !== null ? { track: flag(track, true) } : {}),
      ...(pui === 'in_place' || pui === 'link_out' || pui === 'hidden' ? { purchaseUi: pui } : {}),
      ...(theme === 'light' || theme === 'dark' ? { theme } : {}),
      autoplay: flag(get('autoplay'), false),
      loading,
      ...(poster && !/^\s*javascript:/i.test(poster) ? { poster } : {}),
      ...(title ? { title } : {}),
      aspect: parseAspect(get('aspect')),
      ...(LOCALE_RE.test(locale) ? { locale } : {}),
      toolbar: flag(get('toolbar'), true),
      cover: flag(get('cover'), false),
      ...(Number.isFinite(seconds) && seconds >= 0.5 && seconds <= 120 ? { secondsPerPanel: seconds } : {}),
      maxLive: Number.isFinite(maxLive) && maxLive >= 1 ? maxLive : DEFAULT_MAX_LIVE,
      exclusiveAudio: flag(get('exclusive-audio'), false),
    },
  };
}

/** The origin the player page will run on, or null (file:// and other opaque origins). */
export function frameOrigin(src: string, baseHref: string): string | null {
  try {
    const url = new URL(src, baseHref);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The iframe URL: the player page plus the embed parameters (`embed=1`,
 * `origin`, `chapter`, `autoplay`, `toolbar`, `cover`, `lang`, `spp`; 2.0:
 * `ch`, `track`, `pui`, `bridge`). Existing query parameters of `src` are kept.
 */
export function buildFrameUrl(options: EmbedElementOptions, baseHref: string, hostOrigin: string | null, nonce?: string): string {
  const url = new URL(options.src, baseHref);
  const params = url.searchParams;
  params.set('embed', '1');
  if (hostOrigin && hostOrigin !== 'null') params.set('origin', hostOrigin);
  else params.delete('origin');
  if (options.chapter) params.set('chapter', options.chapter);
  else params.delete('chapter');
  if (options.channel) params.set('ch', options.channel);
  if (options.track !== undefined) params.set('track', options.track ? '1' : '0');
  if (options.purchaseUi) params.set('pui', options.purchaseUi);
  if (nonce) params.set('bridge', nonce);
  params.set('autoplay', options.autoplay ? '1' : '0');
  params.set('toolbar', options.toolbar ? '1' : '0');
  params.set('cover', options.cover ? '1' : '0');
  if (options.locale) params.set('lang', options.locale);
  if (options.secondsPerPanel) params.set('spp', String(options.secondsPerPanel));
  return url.toString();
}

/** When an instance mounts: `auto` makes the first one eager; reduced data waits for a tap. */
export function resolveStrategy(
  loading: LoadingStrategy,
  isFirst: boolean,
  reducedData: boolean
): 'eager' | 'lazy' | 'click' {
  if (loading === 'click') return 'click';
  if (reducedData && loading !== 'eager') return 'click';
  if (loading === 'auto') return isFirst ? 'eager' : 'lazy';
  return loading;
}

export interface LiveInstance {
  id: number;
  /** Distance of the element to the viewport in px (0 = intersecting). */
  distance: number;
  /** At least partly on screen. */
  visible: boolean;
}

/**
 * Which mounted instances go back to their poster so that at most `maxLive`
 * stay mounted: the farthest off-screen ones first; visible ones never.
 */
export function pickUnmount(live: LiveInstance[], maxLive: number): number[] {
  const excess = live.length - Math.max(1, maxLive);
  if (excess <= 0) return [];
  return live
    .filter((instance) => !instance.visible)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, excess)
    .map((instance) => instance.id);
}

/** Distance of a rect to the viewport (0 when they overlap). */
export function viewportDistance(top: number, bottom: number, viewportHeight: number): number {
  if (bottom < 0) return -bottom;
  if (top > viewportHeight) return top - viewportHeight;
  return 0;
}

/** A bridge nonce: 16 random bytes as base64url (22 characters). */
export function newNonce(random: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = random(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `PanelWave.mount()` options (2.0). */
export interface MountOptions {
  src: string;
  chapter?: string;
  channel?: string;
  locale?: string;
  theme?: 'light' | 'dark';
  /** `eager` (default for mount()), `lazy` or `click` (poster first, nothing loads before the tap). */
  loading?: 'eager' | 'lazy' | 'click';
  poster?: { image?: string; title?: string; label?: string };
  privacy?: { tracking?: boolean };
  purchaseUi?: PurchaseUi;
  /** Where to continue (`restore`, after the player is ready). */
  resume?: { panelId: string; variables?: Record<string, unknown> };
  autoplay?: boolean;
  toolbar?: boolean;
  cover?: boolean;
  /** Initial box shape until the player reports its own (`resize`), e.g. `3/4`. */
  aspect?: string;
  secondsPerPanel?: number;
}

/** `mount()` options → the element options the loader works with (same validation as `data-*`). */
export function fromMountOptions(o: MountOptions): OptionsResult {
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : v === undefined ? null : String(v));
  const bool = (v: unknown): string | null => (typeof v === 'boolean' ? (v ? '1' : '0') : null);
  const map: Record<string, string | null> = {
    src: str(o.src),
    chapter: str(o.chapter),
    channel: str(o.channel),
    locale: str(o.locale),
    theme: str(o.theme),
    loading: str(o.loading ?? 'eager'),
    poster: str(o.poster?.image),
    title: str(o.poster?.title),
    track: bool(o.privacy?.tracking),
    'purchase-ui': str(o.purchaseUi),
    autoplay: bool(o.autoplay),
    toolbar: bool(o.toolbar),
    cover: bool(o.cover),
    aspect: str(o.aspect),
    'seconds-per-panel': o.secondsPerPanel === undefined ? null : String(o.secondsPerPanel),
  };
  return readOptions((name) => map[name] ?? null);
}

/** A `resize` event's `aspect` as a CSS aspect-ratio value, or null. */
export function resizeAspect(data: unknown): string | null {
  const aspect = Number((data as { aspect?: unknown } | null)?.aspect);
  return Number.isFinite(aspect) && aspect > 0.1 && aspect < 10 ? `${Math.round(aspect * 10000) / 10000} / 1` : null;
}

/** Inbound bridge message from the player page (protocol v1–v4), loosely checked. */
export interface PlayerMessage {
  type: 'pw:hello' | 'pw:ready' | 'pw:event' | 'pw:state';
  name?: string;
  data?: unknown;
  protocol?: number;
}

export function isPlayerMessage(data: unknown): data is PlayerMessage {
  if (!data || typeof data !== 'object') return false;
  const type = (data as { type?: unknown }).type;
  return type === 'pw:hello' || type === 'pw:ready' || type === 'pw:event' || type === 'pw:state';
}

/** DOM event name for a player event: `chapterComplete` → `panelwave:chaptercomplete`. */
export function domEventName(name: string): string {
  return 'panelwave:' + name.toLowerCase();
}
