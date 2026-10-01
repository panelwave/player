import { isDevMode } from '@angular/core';

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

declare global {
  interface Window {
    __PW_READER__?: Partial<ReaderBootConfig>;
  }
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
