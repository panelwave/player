import type { PanelWaveManifest } from 'player';

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
  if (r['print'] === true) {
    // A print render is static: no cover or toolbar, the page view, no motion.
    config.print = true;
    config.showCover = false;
    config.showToolbar = false;
    config.viewMode = 'page';
    config.reducedMotion = true;
  }
  return config;
}

/** The page to open from `?page=<manifest page id>`; undefined when absent or malformed. */
export function pageIdFromSearch(search: string): string | undefined {
  const value = new URLSearchParams(search).get('page');
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
