/**
 * Theme service (schema 1.10+ `ui.theme`).
 *
 * Resolves the work-wide widget theme — per-layer overrides are applied by
 * the widgets themselves — and publishes it as `--pw-theme-*` CSS custom
 * properties scoped to one player instance:
 *
 *   built-in defaults for `mode` → derived from `ui.branding` → `ui.theme` → host `themeOverride`
 *
 * The properties are written into a zero-specificity rule
 * (`:where([data-pw-theme="n"]) { … }`), so a host page can still override
 * any of them with an ordinary rule such as
 * `pw-player-shell { --pw-theme-accent: #e11d48; }`.
 */
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { ThemeColors, UISettings, UITheme } from '../types';

export type ThemeMode = 'light' | 'dark';

export interface PwResolvedTheme {
  mode: ThemeMode;
  colors: Required<ThemeColors>;
  fonts: { ui: string; body: string };
  shape: { radius: number; borderWidth: number; shadow: 'none' | 'soft' | 'hard' };
  density: 'regular' | 'compact';
}

/** A host-side theme on top of the manifest's (`PlayerShellComponent.themeOverride`). */
export type PwThemeOverride = UITheme;

const UI_FONT_FALLBACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const BODY_FONT_FALLBACK = "Georgia, 'Times New Roman', serif";

export const DEFAULT_THEME_COLORS: Record<ThemeMode, Required<ThemeColors>> = {
  dark: {
    surface: '#1f2937',
    onSurface: '#f9fafb',
    surfaceMuted: '#374151',
    onSurfaceMuted: '#d1d5db',
    accent: '#f59e0b',
    onAccent: '#111827',
    border: '#4b5563',
    focus: '#93c5fd',
    track: '#4b5563',
    progress: '#f59e0b',
    waveform: '#6b7280',
    waveformProgress: '#f59e0b',
    link: '#93c5fd',
    backdrop: '#000000b3',
  },
  light: {
    surface: '#ffffff',
    onSurface: '#111827',
    surfaceMuted: '#f3f4f6',
    onSurfaceMuted: '#4b5563',
    accent: '#2563eb',
    onAccent: '#ffffff',
    border: '#d1d5db',
    focus: '#2563eb',
    track: '#d1d5db',
    progress: '#2563eb',
    waveform: '#9ca3af',
    waveformProgress: '#2563eb',
    link: '#1d4ed8',
    backdrop: '#0f172acc',
  },
};

const SHADOWS: Record<'none' | 'soft' | 'hard', string> = {
  none: 'none',
  soft: '0 4px 16px rgba(0, 0, 0, 0.18)',
  hard: '3px 3px 0 rgba(0, 0, 0, 0.85)',
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FONT = /^[A-Za-z0-9 ,'"._-]{1,128}$/;

function validHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

function rgbOf(hex: string): [number, number, number] {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG relative luminance of a hex colour (alpha ignored). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two hex colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Readable text colour on a background (near-black or white). */
export function readableOn(background: string): string {
  return contrastRatio(background, '#111827') >= contrastRatio(background, '#ffffff') ? '#111827' : '#ffffff';
}

/** `a` mixed towards `b` by `t` (0..1), as #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = rgbOf(a);
  const cb = rgbOf(b);
  return '#' + ca.map((c, i) => Math.round(c + (cb[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

function fontStack(font: { family?: string; fallback?: string } | undefined, fallback: string): string | null {
  if (!font?.family || !FONT.test(font.family)) return null;
  const family = /[\s,]/.test(font.family) && !/^["']/.test(font.family) ? `"${font.family}"` : font.family;
  const tail = font.fallback && FONT.test(font.fallback) ? font.fallback : fallback;
  return `${family}, ${tail}`;
}

/**
 * Resolve `ui.theme` (+ `ui.branding`, + a host override) into a complete
 * theme. Invalid values are ignored, so a broken manifest never breaks the
 * widgets' look.
 */
export function resolveTheme(
  ui: UISettings | null | undefined,
  prefersDark = true,
  override?: PwThemeOverride | null
): PwResolvedTheme {
  const theme: UITheme = { ...(ui?.theme ?? {}), ...(override ?? {}) };
  const requested = override?.mode ?? ui?.theme?.mode ?? 'dark';
  const mode: ThemeMode = requested === 'auto' ? (prefersDark ? 'dark' : 'light') : requested === 'light' ? 'light' : 'dark';
  const colors: Required<ThemeColors> = { ...DEFAULT_THEME_COLORS[mode] };
  const explicit: ThemeColors = {};

  // Branding: accent and surface, with readable text derived.
  const branding = ui?.branding;
  if (validHex(branding?.accentColor)) explicit.accent = branding!.accentColor;
  if (validHex(branding?.primaryColor)) explicit.surface = branding!.primaryColor;

  for (const source of [ui?.theme?.colors, override?.colors]) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (key in colors && validHex(value)) {
        (explicit as Record<string, string>)[key] = value;
      }
    }
  }
  Object.assign(colors, explicit);

  // Derived tokens the author did not set explicitly.
  if (explicit.surface) {
    if (!explicit.onSurface) colors.onSurface = readableOn(colors.surface);
    if (!explicit.onSurfaceMuted) colors.onSurfaceMuted = mixHex(colors.onSurface, colors.surface, 0.3);
    if (!explicit.surfaceMuted) colors.surfaceMuted = mixHex(colors.surface, colors.onSurface, 0.1);
    if (!explicit.border) colors.border = mixHex(colors.surface, colors.onSurface, 0.25);
    if (!explicit.track) colors.track = colors.border;
    if (!explicit.waveform) colors.waveform = mixHex(colors.surface, colors.onSurface, 0.4);
  }
  if (explicit.accent) {
    if (!explicit.onAccent) colors.onAccent = readableOn(colors.accent);
    if (!explicit.progress) colors.progress = colors.accent;
    if (!explicit.waveformProgress) colors.waveformProgress = colors.accent;
  }

  const shape = theme.shape ?? {};
  const radius = typeof shape.radius === 'number' && shape.radius >= 0 ? Math.min(32, shape.radius) : 12;
  const borderWidth = typeof shape.borderWidth === 'number' && shape.borderWidth >= 0 ? Math.min(4, shape.borderWidth) : 1;
  const shadow = shape.shadow === 'none' || shape.shadow === 'hard' ? shape.shadow : 'soft';

  return {
    mode,
    colors,
    fonts: {
      ui: fontStack(theme.fonts?.ui, UI_FONT_FALLBACK) ?? UI_FONT_FALLBACK,
      body: fontStack(theme.fonts?.body, BODY_FONT_FALLBACK) ?? BODY_FONT_FALLBACK,
    },
    shape: { radius, borderWidth, shadow },
    density: theme.density === 'compact' ? 'compact' : 'regular',
  };
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** The `--pw-theme-*` custom properties of a resolved theme. */
export function themeCssVariables(theme: PwResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.colors)) {
    vars[`--pw-theme-${kebab(key)}`] = value;
  }
  vars['--pw-theme-font-ui'] = theme.fonts.ui;
  vars['--pw-theme-font-body'] = theme.fonts.body;
  vars['--pw-theme-radius'] = `${theme.shape.radius}px`;
  vars['--pw-theme-border-width'] = `${theme.shape.borderWidth}px`;
  vars['--pw-theme-shadow'] = SHADOWS[theme.shape.shadow];
  vars['--pw-theme-density'] = theme.density === 'compact' ? '0.85' : '1';
  return vars;
}

let nextScope = 1;

/**
 * Applies the resolved theme to one player instance (provided by
 * `PlayerShellComponent`). `theme$` re-emits whenever the theme changes —
 * canvas-drawn widgets (the audio waveform) repaint on it.
 */
@Injectable()
export class ThemeService implements OnDestroy {
  private readonly scope = String(nextScope++);
  private styleEl: HTMLStyleElement | null = null;
  private host: HTMLElement | null = null;
  private ui: UISettings | null = null;
  private override: PwThemeOverride | null = null;
  private media: MediaQueryList | null = null;
  private readonly themeSubject = new BehaviorSubject<PwResolvedTheme>(resolveTheme(null));

  readonly theme$: Observable<PwResolvedTheme> = this.themeSubject.asObservable();

  private readonly onMediaChange = () => this.render();

  get theme(): PwResolvedTheme {
    return this.themeSubject.value;
  }

  /** Attach to the shell host element (once). */
  attach(host: HTMLElement): void {
    if (this.host === host) return;
    this.host = host;
    host.setAttribute('data-pw-theme', this.scope);
    this.render();
  }

  /** The manifest's `ui` block changed (manifest loaded / replaced). */
  setUi(ui: UISettings | null | undefined): void {
    this.ui = ui ?? null;
    this.render();
  }

  /** A host-side theme (shell input / embed `setTheme`). */
  setOverride(override: PwThemeOverride | null | undefined): void {
    this.override = override ?? null;
    this.render();
  }

  private prefersDark(): boolean {
    const wantsAuto = (this.override?.mode ?? this.ui?.theme?.mode) === 'auto';
    if (!wantsAuto) {
      this.media?.removeEventListener('change', this.onMediaChange);
      this.media = null;
      return true;
    }
    if (!this.media && typeof window !== 'undefined' && window.matchMedia) {
      this.media = window.matchMedia('(prefers-color-scheme: dark)');
      this.media.addEventListener('change', this.onMediaChange);
    }
    return this.media ? this.media.matches : true;
  }

  private render(): void {
    const theme = resolveTheme(this.ui, this.prefersDark(), this.override);
    this.themeSubject.next(theme);
    if (!this.host || typeof document === 'undefined') return;
    this.host.setAttribute('data-pw-theme-mode', theme.mode);
    const body = Object.entries(themeCssVariables(theme))
      .map(([k, v]) => `${k}: ${v};`)
      .join(' ');
    if (!this.styleEl) {
      this.styleEl = document.createElement('style');
      this.styleEl.setAttribute('data-pw-theme-style', this.scope);
      document.head.appendChild(this.styleEl);
    }
    this.styleEl.textContent = `:where([data-pw-theme="${this.scope}"]) { ${body} }`;
  }

  ngOnDestroy(): void {
    this.media?.removeEventListener('change', this.onMediaChange);
    this.styleEl?.remove();
    this.styleEl = null;
    this.themeSubject.complete();
  }
}
