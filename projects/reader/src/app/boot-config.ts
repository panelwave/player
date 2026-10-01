import { isDevMode } from '@angular/core';

export interface ReaderBootConfig {
  manifestUrl: string;
  embed: boolean;
  locale?: string;
  title?: string;
}

declare global {
  interface Window {
    __PW_READER__?: Partial<ReaderBootConfig>;
  }
}

/**
 * Boot config injected by the reader server as `window.__PW_READER__`.
 * Dev-mode-only fallback (no server): `?manifest=<url>&embed=1&locale=`;
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
      ...(injected.locale ? { locale: injected.locale } : {}),
      ...(injected.title ? { title: injected.title } : {}),
    };
  }
  if (!allowQuery) {
    return { manifestUrl: '', embed: false };
  }
  const params = new URLSearchParams(win.location.search);
  const manifestUrl = params.get('manifest') ?? '';
  return {
    manifestUrl,
    embed: params.get('embed') === '1',
    ...(params.get('locale') ? { locale: params.get('locale') as string } : {}),
  };
}
