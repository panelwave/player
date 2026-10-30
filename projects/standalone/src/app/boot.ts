import type { PanelWaveManifest, PrintOptions } from 'player';
import { normalizeOrigin, parseChapterRef, parseEmbedFlag, parseSecondsPerPanel } from 'player';

/**
 * Boot rules of the standalone player (a self-contained package next to its
 * work: index.html + panelwave.js / panelwave.json + assets/).
 *
 * The work comes from `window.PANELWAVE_MANIFEST`, set by the classic script
 * `panelwave.js`. That is the only way that works from disk (file://), where
 * browsers block fetch() and module scripts. On a web server the page falls
 * back to fetching `panelwave.json` (+ `panelwave.config.json`) when the
 * script is missing.
 */

/** Reader-facing options the CMS export writes into the package. */
export interface StandaloneConfig {
  /** Start locale; used only when it is one of the work's locales. */
  locale?: string;
  showCover: boolean;
  showToolbar: boolean;
  /** Page format id to show (e.g. `a4-portrait`); absent = chosen by screen size. */
  pageFormat?: string;
  /** Start view; absent = page view when the work has pages. */
  viewMode?: 'page' | 'panel';
  /** Hold animations at their end state, no autoplay (also on when the OS asks for it). */
  reducedMotion?: boolean;
  /**
   * Static print render (the CMS PDF export prints each page through this):
   * no cover, no toolbar, page view, reduced motion. Adds `pw-print` to
   * `<html>` so a print stylesheet can target it.
   */
  print?: boolean;
  /**
   * Content widgets in a print render (only with `print`): `widgets` qr /
   * card / hide, `linkBase` the work's reader URL for the QR codes,
   * `attachments` catalog file id → page number of the appended file.
   */
  printOptions?: PrintOptions;
  /**
   * Per-chapter defaults for chapter embeds (keyed by manifest chapter id or
   * CMS chapter uuid), written by the CMS export from the chapters' embed
   * settings. Used when the page URL does not say.
   */
  chapters?: Record<string, ChapterEmbedDefaults>;
}

/** Defaults of one chapter embed. */
export interface ChapterEmbedDefaults {
  /** Start autoplay (the embed loader starts it only once the player is on screen). */
  autoplay?: boolean;
  /** Poster image (package-relative path) the embed loader shows before loading. */
  poster?: string;
}

export const DEFAULT_CONFIG: StandaloneConfig = { showCover: true, showToolbar: true };

/** The globals `panelwave.js` sets. */
export interface StandaloneWindow {
  PANELWAVE_MANIFEST?: unknown;
  PANELWAVE_CONFIG?: unknown;
}

export type BootPlan =
  | { kind: 'inline'; manifest: PanelWaveManifest; config: StandaloneConfig }
  | { kind: 'fetch' }
  | { kind: 'missing' };

/** Where the work comes from: the inline global, a fetch (http only) or nowhere. */
export function planBoot(win: StandaloneWindow, protocol: string): BootPlan {
  if (isManifestLike(win.PANELWAVE_MANIFEST)) {
    return { kind: 'inline', manifest: win.PANELWAVE_MANIFEST, config: normalizeConfig(win.PANELWAVE_CONFIG) };
  }
  return protocol === 'file:' ? { kind: 'missing' } : { kind: 'fetch' };
}

/** Minimal shape check: the player validates the rest itself. */
export function isManifestLike(value: unknown): value is PanelWaveManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return typeof m['meta'] === 'object' && m['meta'] !== null && Array.isArray(m['chapters']);
}

/** Defaults for absent or malformed fields; unknown keys are ignored. */
export function normalizeConfig(raw: unknown): StandaloneConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };
  const r = raw as Record<string, unknown>;
  const config: StandaloneConfig = {
    locale: typeof r['locale'] === 'string' && r['locale'] ? r['locale'] : undefined,
    showCover: typeof r['showCover'] === 'boolean' ? r['showCover'] : DEFAULT_CONFIG.showCover,
    showToolbar: typeof r['showToolbar'] === 'boolean' ? r['showToolbar'] : DEFAULT_CONFIG.showToolbar,
  };
  if (typeof r['pageFormat'] === 'string' && /^[a-z0-9-]+$/.test(r['pageFormat'])) config.pageFormat = r['pageFormat'];
  if (r['viewMode'] === 'page' || r['viewMode'] === 'panel') config.viewMode = r['viewMode'];
  if (typeof r['reducedMotion'] === 'boolean') config.reducedMotion = r['reducedMotion'];
  const chapters = normalizeChapterDefaults(r['chapters']);
  if (chapters) config.chapters = chapters;
  if (r['print'] === true) {
    // A print render is static: no cover or toolbar, the page view, no motion.
    config.print = true;
    config.showCover = false;
    config.showToolbar = false;
    config.viewMode = 'page';
    config.reducedMotion = true;
    const printOptions = normalizePrintOptions(r['printOptions']);
    if (printOptions) config.printOptions = printOptions;
  }
  return config;
}

/** `printOptions`: known modes, an http(s) link base and positive page numbers only. */
function normalizePrintOptions(raw: unknown): PrintOptions | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: PrintOptions = {};
  if (r['widgets'] === 'qr' || r['widgets'] === 'card' || r['widgets'] === 'hide') out.widgets = r['widgets'];
  if (typeof r['linkBase'] === 'string' && /^https?:\/\//i.test(r['linkBase'])) out.linkBase = r['linkBase'];
  if (r['attachments'] && typeof r['attachments'] === 'object' && !Array.isArray(r['attachments'])) {
    const pages: Record<string, number> = {};
    for (const [id, page] of Object.entries(r['attachments'] as Record<string, unknown>)) {
      if (typeof page === 'number' && Number.isInteger(page) && page > 0) pages[id] = page;
    }
    if (Object.keys(pages).length) out.attachments = pages;
  }
  return Object.keys(out).length ? out : undefined;
}

/** `chapters` map: valid keys and fields only; undefined when nothing is left. */
function normalizeChapterDefaults(raw: unknown): Record<string, ChapterEmbedDefaults> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, ChapterEmbedDefaults> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!parseChapterRef(key) || !value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const entry: ChapterEmbedDefaults = {};
    if (typeof v['autoplay'] === 'boolean') entry.autoplay = v['autoplay'];
    if (typeof v['poster'] === 'string' && v['poster'] && !/^\s*javascript:/i.test(v['poster'])) entry.poster = v['poster'];
    out[key] = entry;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Chapter-embed parameters of the page URL
 * (`?embed=1&origin=&chapter=&autoplay=&toolbar=&cover=&spp=`), see
 * docs/MULTI_CHAPTER_EMBED.md. Autoplay falls back to the chapter's default
 * from the config's `chapters` map.
 */
export interface EmbedParams {
  embed: boolean;
  /** Origin of the framing page; absent = this page's own origin. */
  origin?: string;
  chapter?: string;
  autoplay?: boolean;
  showToolbar?: boolean;
  showCover?: boolean;
  secondsPerPanel?: number;
}

export function embedParamsFromSearch(search: string, config: StandaloneConfig): EmbedParams {
  const params = new URLSearchParams(search);
  const out: EmbedParams = { embed: params.get('embed') === '1' };
  const origin = normalizeOrigin(params.get('origin'));
  if (origin) out.origin = origin;
  const chapter = parseChapterRef(params.get('chapter'));
  if (chapter) out.chapter = chapter;
  const autoplay = parseEmbedFlag(params.get('autoplay')) ?? (chapter ? config.chapters?.[chapter]?.autoplay : undefined);
  if (autoplay !== undefined) out.autoplay = autoplay;
  const toolbar = parseEmbedFlag(params.get('toolbar'));
  if (toolbar !== undefined) out.showToolbar = toolbar;
  const cover = parseEmbedFlag(params.get('cover'));
  if (cover !== undefined) out.showCover = cover;
  const seconds = parseSecondsPerPanel(params.get('spp'));
  if (seconds !== undefined) out.secondsPerPanel = seconds;
  return out;
}

/** The page to open from `?page=<manifest page id>`; undefined when absent or malformed. */
export function pageIdFromSearch(search: string): string | undefined {
  const value = new URLSearchParams(search).get('page');
  return value && /^[A-Za-z0-9_.:-]{1,200}$/.test(value) ? value : undefined;
}

/** The panel to open from `?panel=<manifest panel id>` (panel view); undefined when absent or malformed. */
export function panelIdFromSearch(search: string): string | undefined {
  const value = new URLSearchParams(search).get('panel');
  return value && /^[A-Za-z0-9_.:-]{1,200}$/.test(value) ? value : undefined;
}

/** The work locale for `wanted`: the exact tag, else the first with the same language (de-AT → de-DE). */
export function matchLocale(wanted: string | null | undefined, available: readonly string[]): string | undefined {
  if (!wanted) return undefined;
  const lower = wanted.toLowerCase();
  const exact = available.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;
  const lang = lower.split('-')[0];
  return available.find((l) => l.toLowerCase().split('-')[0] === lang);
}

/**
 * Start locale, first match wins: `?locale=` / `?lang=` in the URL, the
 * package config, the manifest's default locale.
 */
export function chooseLocale(manifest: PanelWaveManifest, search: string, config: StandaloneConfig): string {
  const defaultLocale = manifest.meta?.default_locale ?? 'en-US';
  const available = manifest.meta?.locales?.length ? manifest.meta.locales : [defaultLocale];
  const params = new URLSearchParams(search);
  for (const candidate of [params.get('locale'), params.get('lang'), config.locale]) {
    const hit = matchLocale(candidate, available);
    if (hit) return hit;
  }
  return defaultLocale;
}

/** A LocalizedString (or plain string) in `locale`, then the default locale, then any value. */
export function localizedText(value: unknown, locale: string, defaultLocale?: string): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const map = value as Record<string, unknown>;
  for (const key of [locale, defaultLocale]) {
    const hit = key ? map[key] : undefined;
    if (typeof hit === 'string' && hit) return hit;
  }
  const any = Object.values(map).find((v) => typeof v === 'string' && v);
  return typeof any === 'string' ? any : '';
}

/** Placeholder title of the package's index.html (the CMS export replaces it). */
export const PLACEHOLDER_TITLE = 'PanelWave';
