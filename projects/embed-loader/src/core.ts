/**
 * PanelWave embed loader — pure logic (no DOM): reading an element's
 * options, building the iframe URL, choosing when to mount, deciding which
 * iframes to unmount. Unit-tested by scripts/embed-loader.test.mjs.
 * See docs/MULTI_CHAPTER_EMBED.md.
 */

export const LOADER_VERSION = '1.0.0';

/** `eager`: mount at once · `lazy`: when near the viewport · `auto`: first eager, rest lazy · `click`: on tap. */
export type LoadingStrategy = 'eager' | 'lazy' | 'auto' | 'click';

/** How far ahead of the viewport lazy instances mount. */
export const LAZY_ROOT_MARGIN = '800px 0px';

/** Default for how many iframes stay mounted at once (farther ones go back to their poster). */
export const DEFAULT_MAX_LIVE = 3;

export interface EmbedElementOptions {
  /** Player page: the reader URL of a work, or a package's index.html (relative to the page). */
  src: string;
  /** Chapter: CMS chapter uuid (stable) or manifest chapter id. */
  chapter: string;
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
  if (!CHAPTER_RE.test(chapter)) {
    return { ok: false, error: 'data-chapter is missing or malformed' };
  }
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
      chapter,
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
 * The iframe URL: the player page plus the chapter-embed parameters
 * (`embed=1`, `origin`, `chapter`, `autoplay`, `toolbar`, `cover`, `lang`,
 * `spp`). Existing query parameters of `src` are kept.
 */
export function buildFrameUrl(options: EmbedElementOptions, baseHref: string, hostOrigin: string | null): string {
  const url = new URL(options.src, baseHref);
  const params = url.searchParams;
  params.set('embed', '1');
  if (hostOrigin && hostOrigin !== 'null') params.set('origin', hostOrigin);
  else params.delete('origin');
  params.set('chapter', options.chapter);
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

/** Inbound bridge message from the player page (protocol v1/v2), loosely checked. */
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
