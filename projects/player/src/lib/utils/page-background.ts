/**
 * Page background color. The page color fills the space between and around
 * the panels in page view and the frame around the panel in panel view, so a
 * reader moving from a white page to a black one sees the switch at the
 * first panel of the new page.
 */
import type { Page, Settings } from '../types';

/** Used when neither the page nor the work sets a color. */
export const DEFAULT_PAGE_BACKGROUND = '#1a1a1a';

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * The page's background color: `page.visual.background_color`, else the
 * work's `settings.typography.default_page_bg_color`, else
 * {@link DEFAULT_PAGE_BACKGROUND}. Values that are not CSS hex colors are
 * skipped.
 */
export function resolvePageBackground(
  page: Page | null | undefined,
  settings: Settings | null | undefined
): string {
  const candidates = [
    page?.visual?.background_color,
    settings?.typography?.default_page_bg_color,
  ];
  for (const color of candidates) {
    if (typeof color === 'string' && HEX_COLOR.test(color.trim())) {
      return color.trim();
    }
  }
  return DEFAULT_PAGE_BACKGROUND;
}
