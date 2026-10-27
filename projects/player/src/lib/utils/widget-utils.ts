/**
 * Helpers for the content widget layers (schema 1.10+): layer visibility,
 * file-type icons, byte and media-time formatting, iframe URL checks.
 * All pure — no Angular, no DOM.
 */
import type { Layer } from '../types';
import type { VariableContext } from '../types/variable.types';
import { evaluateJsonLogic } from './json-logic-utils';

/**
 * Whether a layer is shown for the current variables: no `visibleIf` (or no
 * context yet) = shown, otherwise the JSON Logic result. Same rule as hotspots.
 */
export function isLayerVisible(layer: Pick<Layer, 'visibleIf'>, context: VariableContext | null | undefined): boolean {
  if (!layer.visibleIf || !context) return true;
  return evaluateJsonLogic(layer.visibleIf, context);
}

// ---------------------------------------------------------------------------
// File types
// ---------------------------------------------------------------------------

export type FileTypeKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'archive'
  | 'image'
  | 'audio'
  | 'video'
  | 'text'
  | 'generic';

export interface FileTypeInfo {
  kind: FileTypeKind;
  /** Short badge label, e.g. `PDF`, `DOCX` (max 4 characters). */
  label: string;
  /** Badge colour (fixed per type so readers recognise it across works). */
  color: string;
}

const KIND_COLORS: Record<FileTypeKind, string> = {
  pdf: '#d93025',
  word: '#2b579a',
  excel: '#217346',
  powerpoint: '#c43e1c',
  archive: '#795548',
  image: '#8e24aa',
  audio: '#e37400',
  video: '#c2185b',
  text: '#546e7a',
  generic: '#607d8b',
};

const EXTENSION_KINDS: Record<string, FileTypeKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  odt: 'word',
  rtf: 'word',
  xls: 'excel',
  xlsx: 'excel',
  ods: 'excel',
  csv: 'excel',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  odp: 'powerpoint',
  zip: 'archive',
  epub: 'archive',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  ogg: 'audio',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  txt: 'text',
  md: 'text',
  json: 'text',
};

/** Lower-case extension of a file name or URL path (no dot), or ''. */
export function fileExtensionOf(name: string | undefined | null): string {
  if (!name) return '';
  const path = name.split(/[?#]/)[0];
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : '';
}

function kindOfMime(mime: string): FileTypeKind | null {
  const m = mime.toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('wordprocessingml') || m === 'application/msword' || m.includes('opendocument.text') || m === 'application/rtf') return 'word';
  if (m.includes('spreadsheetml') || m === 'application/vnd.ms-excel' || m.includes('opendocument.spreadsheet') || m === 'text/csv') return 'excel';
  if (m.includes('presentationml') || m === 'application/vnd.ms-powerpoint' || m.includes('opendocument.presentation')) return 'powerpoint';
  if (m === 'application/zip' || m === 'application/epub+zip' || m.includes('compressed')) return 'archive';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('text/') || m === 'application/json') return 'text';
  return null;
}

/** Icon badge for a file: kind from the MIME type, else the extension. */
export function fileTypeInfo(mime: string | undefined | null, fileName: string | undefined | null): FileTypeInfo {
  const ext = fileExtensionOf(fileName);
  const kind = (mime ? kindOfMime(mime) : null) ?? EXTENSION_KINDS[ext] ?? 'generic';
  const label = (ext || (kind === 'generic' ? 'FILE' : kind)).slice(0, 4).toUpperCase();
  return { kind, label, color: KIND_COLORS[kind] };
}

/**
 * Human file size for the reader's locale, binary steps with the usual
 * labels (`482 KB`, `1.4 MB`). Empty for unknown sizes.
 */
export function formatBytes(bytes: number | undefined | null, locale = 'en-US'): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  let text: string;
  try {
    text = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  } catch {
    text = value.toFixed(digits);
  }
  return `${text} ${units[unit]}`;
}

/** Media time as `m:ss` (or `h:mm:ss` from one hour). Non-finite → `0:00`. */
export function formatMediaTime(seconds: number | undefined | null): string {
  const total = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ---------------------------------------------------------------------------
// Iframes
// ---------------------------------------------------------------------------

export type IframeUrlVerdict = 'ok' | 'insecure' | 'same-origin' | 'invalid';

/**
 * Whether an iframe layer may load `src`: https only, and never the reader's
 * own origin (with the default sandbox's allow-same-origin an embedded page
 * from our origin could reach into the player).
 */
export function checkIframeUrl(src: string | undefined | null, ownOrigin?: string | null): IframeUrlVerdict {
  if (!src || typeof src !== 'string') return 'invalid';
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return 'invalid';
  }
  if (url.protocol !== 'https:') return 'insecure';
  if (ownOrigin && url.origin === ownOrigin) return 'same-origin';
  return 'ok';
}

/** The iframe `sandbox` attribute value for a preset (`null` = no attribute). */
export function iframeSandboxValue(preset: 'default' | 'strict' | 'none' | undefined): string | null {
  switch (preset) {
    case 'none':
      return null;
    case 'strict':
      return 'allow-scripts';
    default:
      return 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
  }
}

const IFRAME_ALLOW = new Set(['fullscreen', 'autoplay', 'encrypted-media', 'picture-in-picture', 'clipboard-write']);

/** The iframe `allow` attribute from the layer's list (unknown entries dropped). */
export function iframeAllowValue(allow: readonly string[] | undefined): string {
  return (allow ?? []).filter((a) => IFRAME_ALLOW.has(a)).join('; ');
}

/** Host name of a URL for display (`www.` stripped), or ''. */
export function displayHost(src: string | undefined | null): string {
  try {
    return new URL(src ?? '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
