/**
 * Small helpers shared by the content widget components (schema 1.10+).
 */
import { TranslateService } from '@ngx-translate/core';
import type { LocalizedString, WidgetLayerBase } from '../../../types';
import { resolveLocalizedString } from '../../../utils/locale-utils';
import { uiText } from '../../../utils/ui-text';
import { themeOverrideVars } from '../../../services/theme.service';

/** English fallbacks of the `widgets.*` UI strings (en.json mirrors them). */
export const WIDGET_TEXT_EN: Record<string, string> = {
  download: 'Download',
  download_file: 'Download {{name}}',
  file_size: 'File size',
  play: 'Play',
  pause: 'Pause',
  play_title: 'Play {{title}}',
  seek: 'Playback position',
  mute: 'Mute',
  unmute: 'Unmute',
  fullscreen: 'Fullscreen',
  exit_fullscreen: 'Exit fullscreen',
  close: 'Close',
  video: 'Video',
  watch_video: 'Watch video: {{title}}',
  loading: 'Loading…',
  open_new_tab: 'Open in new tab',
  blocked_insecure: 'This embed is blocked: only secure (https) addresses can be shown.',
  continued_online: 'Continued in the digital edition',
  embedded_content: 'Embedded content',
  audio: 'Audio',
  scroll_region: 'Scrollable text',
  print_scan_open: 'Scan to open online',
  print_scan_listen: 'Scan to listen',
  print_scan_watch: 'Scan to watch',
  print_scan_download: 'Scan to download',
  print_attached_page: 'Printed on page {{page}}',
};

/** A widget UI string in the reader's language (English without ngx-translate). */
export function widgetText(translate: TranslateService | null, key: string, params?: Record<string, unknown>): string {
  return uiText(translate, 'widgets.' + key, WIDGET_TEXT_EN[key], params);
}

/** A localized manifest string for the reader's locale (en-US as last fallback). */
export function localized(value: LocalizedString | string | undefined | null, locale: string): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return resolveLocalizedString(value, locale, 'en-US');
}

/** Root-element styles of a widget: its per-layer colour overrides. */
export function widgetRootStyles(layer: Pick<WidgetLayerBase, 'themeOverrides'> | null | undefined): Record<string, string> {
  return themeOverrideVars(layer?.themeOverrides);
}

/** Unique id of a widget instance across panels (page view shows several). */
export function widgetInstanceId(panelId: string, layerId: string): string {
  return `${panelId || 'panel'}:${layerId}`;
}

/**
 * Seek ratio 0..1 of a pointer on a horizontal track element.
 */
export function ratioFromPointer(event: { clientX: number }, track: Element): number {
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
}
