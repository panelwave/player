/**
 * Reading position as a URL: page view and panel view get their own
 * addresses, so a reader can bookmark or share exactly what they see.
 *
 *   ?page=pg-D3        page view, page `pg-D3`
 *   ?panel=ch1-p022    panel view (and canvas view), panel `ch1-p022`
 *   (neither)          the cover / the start of the work
 *
 * Ids are the manifest's page and panel ids. A page id belongs to one output
 * format; the player falls back to the page showing the same panels when the
 * reader's screen uses another format.
 */

/** What the player shows: the cover, a page, a single panel or the canvas. */
export type PlayerView = 'cover' | 'page' | 'panel' | 'canvas';

/** The reader's position, emitted by the shell's `locationChange` output. */
export interface PlayerLocation {
  view: PlayerView;
  /** Chapter of the current panel (absent on the cover of an empty work). */
  chapterId?: string;
  /** Current panel (page view: the panel the reader is on). */
  panelId?: string;
  /** Open page (page view only). */
  pageId?: string;
}

/** URL query parameters the position uses. */
export const LOCATION_PARAMS = { page: 'page', panel: 'panel' } as const;

/** Ids are schema Identifiers: anything else in the URL is ignored. */
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/;

/** The position a URL's query string asks for (page wins over panel). */
export function parseLocationSearch(search: string): { pageId?: string; panelId?: string } {
  const params = new URLSearchParams(search);
  const pageId = params.get(LOCATION_PARAMS.page) ?? '';
  if (IDENTIFIER.test(pageId)) {
    return { pageId };
  }
  const panelId = params.get(LOCATION_PARAMS.panel) ?? '';
  if (IDENTIFIER.test(panelId)) {
    return { panelId };
  }
  return {};
}

/**
 * The URL for a position: `href` with the position's query parameter set and
 * every other parameter kept (e.g. `embed`). `drop` removes further
 * parameters (a share link leaves out `embed`).
 */
export function locationUrl(href: string, location: PlayerLocation, drop: readonly string[] = []): string {
  const url = new URL(href);
  url.searchParams.delete(LOCATION_PARAMS.page);
  url.searchParams.delete(LOCATION_PARAMS.panel);
  for (const name of drop) {
    url.searchParams.delete(name);
  }
  if (location.view === 'page' && location.pageId) {
    url.searchParams.set(LOCATION_PARAMS.page, location.pageId);
  } else if ((location.view === 'panel' || location.view === 'canvas') && location.panelId) {
    url.searchParams.set(LOCATION_PARAMS.panel, location.panelId);
  }
  url.hash = '';
  return url.toString();
}
