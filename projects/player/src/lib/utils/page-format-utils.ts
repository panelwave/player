/**
 * Page view format selection. A chapter carries one page sequence per output
 * format (`Page.layout.format`): mobile, tablet, desktop, big screen, print…
 * The player shows the sequence that suits the screen best and keeps the
 * others out of page navigation, the TOC and the page lookup.
 */
import type { Page } from '../types';
import { OUTPUT_FORMAT_ASPECT } from './focus-rect-utils';

/** Screen classes the format preference lists are keyed by. */
export type ScreenClass = 'phone' | 'tablet' | 'desktop' | 'bigscreen';

/** Narrower than this (CSS px, portrait) is a phone. */
const PHONE_MAX_WIDTH = 600;
/** At least this wide (CSS px, landscape) is a big screen… */
const BIGSCREEN_MIN_CSS_WIDTH = 2200;
/** …or a 4K panel (physical px) shown at least desktop-wide (CSS px). */
const BIGSCREEN_MIN_PHYSICAL_WIDTH = 3600;
const BIGSCREEN_MIN_SCALED_CSS_WIDTH = 1800;

const PORTRAIT_PRINT = ['a4-portrait', 'us-portrait'];
const LANDSCAPE_PRINT = ['a4-landscape', 'us-landscape'];
const WIDE = ['desktop-landscape', 'flex-landscape', 'video-16-9'];

/** Formats in order of preference per screen class; unknown formats follow. */
const PREFERENCES: Readonly<Record<ScreenClass, readonly string[]>> = {
  phone: ['mobile-portrait', 'tablet-portrait', ...PORTRAIT_PRINT, 'square', ...WIDE, ...LANDSCAPE_PRINT, 'bigscreen-landscape'],
  tablet: ['tablet-portrait', ...PORTRAIT_PRINT, 'mobile-portrait', 'square', ...WIDE, ...LANDSCAPE_PRINT, 'bigscreen-landscape'],
  desktop: [...WIDE, 'bigscreen-landscape', ...LANDSCAPE_PRINT, 'square', 'tablet-portrait', ...PORTRAIT_PRINT, 'mobile-portrait'],
  bigscreen: ['bigscreen-landscape', ...WIDE, ...LANDSCAPE_PRINT, 'square', 'tablet-portrait', ...PORTRAIT_PRINT, 'mobile-portrait'],
};

/**
 * Classify the player's viewport. `width`/`height` are CSS px, `dpr` the
 * device pixel ratio: a 4K screen at 150 % or 200 % scaling still counts as
 * a big screen, a laptop at 125 % does not.
 */
export function screenClassFor(width: number, height: number, dpr = 1): ScreenClass {
  if (height > width) {
    return width < PHONE_MAX_WIDTH ? 'phone' : 'tablet';
  }
  const physical = width * (dpr > 0 ? dpr : 1);
  if (
    width >= BIGSCREEN_MIN_CSS_WIDTH ||
    (physical >= BIGSCREEN_MIN_PHYSICAL_WIDTH && width >= BIGSCREEN_MIN_SCALED_CSS_WIDTH)
  ) {
    return 'bigscreen';
  }
  return 'desktop';
}

/** The output format a page is laid out for; null for legacy pages without one. */
export function pageFormatOf(page: Page | null | undefined): string | null {
  const format = page?.layout?.format;
  return typeof format === 'string' && format.length > 0 ? format : null;
}

/** Distinct formats of the given pages, in first-seen order. */
export function pageFormatsOf(pages: readonly Page[] | null | undefined): string[] {
  const formats: string[] = [];
  for (const page of pages ?? []) {
    const format = pageFormatOf(page);
    if (format && !formats.includes(format)) {
      formats.push(format);
    }
  }
  return formats;
}

/**
 * Formats ranked for a screen class: its preference list, then any formats
 * it does not name (closest aspect ratio to `aspect` first). Only formats in
 * `available` are returned.
 */
export function rankPageFormats(available: readonly string[], screen: ScreenClass, aspect = 16 / 9): string[] {
  const known = PREFERENCES[screen].filter((format) => available.includes(format));
  const rest = available
    .filter((format) => !known.includes(format))
    .sort((a, b) => aspectDistance(a, aspect) - aspectDistance(b, aspect));
  return [...known, ...rest];
}

function aspectDistance(format: string, aspect: number): number {
  const ratio = OUTPUT_FORMAT_ASPECT[format];
  return ratio ? Math.abs(Math.log(ratio / aspect)) : Number.POSITIVE_INFINITY;
}

/**
 * The page format to show on this screen, or null when the pages carry no
 * format at all. `preferred` (a host override) wins when pages exist for it.
 */
export function pickPageFormat(
  available: readonly string[],
  width: number,
  height: number,
  dpr = 1,
  preferred?: string | null
): string | null {
  if (available.length === 0) {
    return null;
  }
  if (preferred && available.includes(preferred)) {
    return preferred;
  }
  const w = width > 0 ? width : 1280;
  const h = height > 0 ? height : 800;
  return rankPageFormats(available, screenClassFor(w, h, dpr), w / h)[0] ?? null;
}

/**
 * The page sequence of one format. Pages without a format (legacy) belong to
 * every sequence; a null format means "all pages".
 */
export function pagesForFormat(pages: readonly Page[] | null | undefined, format: string | null): Page[] {
  const list = pages ?? [];
  if (!format) {
    return [...list];
  }
  return list.filter((page) => {
    const pageFormat = pageFormatOf(page);
    return pageFormat === null || pageFormat === format;
  });
}

/** Width / height of a page's frame: its canvas size, else its format's aspect, else 16:9. */
export function pageAspectRatio(page: Page | null | undefined): number {
  const size = page?.layout?.canvasSize;
  if (size && size.width > 0 && size.height > 0) {
    return size.width / size.height;
  }
  const format = pageFormatOf(page);
  return (format && OUTPUT_FORMAT_ASPECT[format]) || 16 / 9;
}
