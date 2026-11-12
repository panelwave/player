// SYNCED FROM panelwave-cms/apps/cms-frontend/src/app/core/utils/panel-border.ts — DO NOT EDIT HERE.
// Edit the CMS copy, then run in panelwave-cms: npm run sync:balloon

/**
 * Panel borders (format 1.14.0 — docs/improvements/panel-borders.md): the
 * line around a panel. Resolution (format default ← work ← panel) and the
 * shapes the editor canvas and the player draw. Pure, no DOM, no imports.
 *
 * MASTER COPY: panelwave-cms/apps/cms-frontend/src/app/core/utils/panel-border.ts.
 * The player keeps a synced copy (run `npm run sync:balloon` in panelwave-cms),
 * so the editor and every reader / export draw the same line.
 *
 * Units are "frame px": px of the page's output-format frame (the page at its
 * authoring size — A4 portrait 794 × 1123, Mobile 375 × 667, …). The host
 * scales the shapes with the page (an SVG viewBox in the player, the canvas
 * transform in the editor).
 *
 * The line lies INSIDE the frame: its outer edge is the frame edge. Straight
 * styles stroke a rect inset by half the thickness. `rough` and `wavy` stroke
 * an outline twice as thick and clip the frame to that outline, so the inner
 * half (the thickness) stays visible and the artwork never shows outside it.
 */

export type PanelBorderLineStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'rough' | 'wavy' | 'none';

/** Every style, in the order editors list them. */
export const PANEL_BORDER_STYLES: readonly PanelBorderLineStyle[] = [
  'solid',
  'dashed',
  'dotted',
  'double',
  'rough',
  'wavy',
  'none',
];

/** A stored / manifest border: schema `PanelBorderStyle`, every field optional and unchecked. */
export interface PanelBorderSource {
  color?: unknown;
  thickness?: unknown;
  style?: unknown;
  radius?: unknown;
}

/** A border with every field decided. */
export interface ResolvedPanelBorder {
  /** CSS hex colour. */
  color: string;
  /** Frame px, 0–10; 0 = no line. */
  thickness: number;
  style: PanelBorderLineStyle;
  /** Corner radius, frame px, 0–200. */
  radius: number;
}

/** The format default (schema 1.14.0): what a work without a setting gets. */
export const DEFAULT_PANEL_BORDER: Readonly<ResolvedPanelBorder> = Object.freeze({
  color: '#000000',
  thickness: 2,
  style: 'solid' as PanelBorderLineStyle,
  radius: 0,
});

export const PANEL_BORDER_MAX_THICKNESS = 10;
export const PANEL_BORDER_MAX_RADIUS = 200;

const COLOR_HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A valid border colour, or null (unset / invalid → inherit). */
export function readPanelBorderColor(value: unknown): string | null {
  return typeof value === 'string' && COLOR_HEX.test(value.trim()) ? value.trim() : null;
}

/** A thickness clamped to 0–10, or null. */
export function readPanelBorderThickness(value: unknown): number | null {
  const n = asNumber(value);
  return n === null ? null : clamp(n, 0, PANEL_BORDER_MAX_THICKNESS);
}

/** A style; an unknown non-empty name draws `solid` (schema rule), empty / non-string → null. */
export function readPanelBorderStyle(value: unknown): PanelBorderLineStyle | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const name = value.trim() as PanelBorderLineStyle;
  return PANEL_BORDER_STYLES.includes(name) ? name : 'solid';
}

/** A corner radius clamped to 0–200, or null. */
export function readPanelBorderRadius(value: unknown): number | null {
  const n = asNumber(value);
  return n === null ? null : clamp(n, 0, PANEL_BORDER_MAX_RADIUS);
}

/**
 * The border a panel shows: each field from the panel's own `border`, else
 * the work's `settings.typography.panel_border_style`, else the format
 * default. Invalid or empty (`''`) values count as unset, field by field.
 */
export function resolvePanelBorder(work?: unknown, panel?: unknown): ResolvedPanelBorder {
  const w = asRecord(work);
  const p = asRecord(panel);
  return {
    color: readPanelBorderColor(p?.['color']) ?? readPanelBorderColor(w?.['color']) ?? DEFAULT_PANEL_BORDER.color,
    thickness:
      readPanelBorderThickness(p?.['thickness']) ??
      readPanelBorderThickness(w?.['thickness']) ??
      DEFAULT_PANEL_BORDER.thickness,
    style: readPanelBorderStyle(p?.['style']) ?? readPanelBorderStyle(w?.['style']) ?? DEFAULT_PANEL_BORDER.style,
    radius: readPanelBorderRadius(p?.['radius']) ?? readPanelBorderRadius(w?.['radius']) ?? DEFAULT_PANEL_BORDER.radius,
  };
}

/** True when the border draws a line (thickness above 0 and a style other than none). */
export function panelBorderHasLine(border: ResolvedPanelBorder): boolean {
  return border.thickness > 0 && border.style !== 'none';
}

// ─── Format frames ──────────────────────────────────────────────────────────

/** Authoring size (frame px) of each output format (schema `PanelBorderStyle` description). */
export const FORMAT_FRAME_PX: Readonly<Record<string, { width: number; height: number }>> = Object.freeze({
  'a4-portrait': { width: 794, height: 1123 },
  'a4-landscape': { width: 1123, height: 794 },
  'us-portrait': { width: 816, height: 1056 },
  'us-landscape': { width: 1056, height: 816 },
  'mobile-portrait': { width: 375, height: 667 },
  'tablet-portrait': { width: 768, height: 1024 },
  square: { width: 1024, height: 1024 },
  'flex-landscape': { width: 1280, height: 800 },
  'desktop-landscape': { width: 1920, height: 1080 },
  'video-16-9': { width: 1920, height: 1080 },
  'bigscreen-landscape': { width: 3840, height: 2160 },
});

/**
 * The frame size of a page: its format's authoring size; for an unknown
 * format the page's `layout.canvasSize`, else A4 height at `aspect`
 * (width / height), else A4 portrait.
 */
export function formatFramePx(
  format: string | null | undefined,
  canvasSize?: { width?: unknown; height?: unknown } | null,
  aspect?: number,
): { width: number; height: number } {
  const known = format ? FORMAT_FRAME_PX[format] : undefined;
  if (known) return known;
  const cw = asNumber(canvasSize?.width);
  const ch = asNumber(canvasSize?.height);
  if (cw && ch && cw > 0 && ch > 0) return { width: cw, height: ch };
  if (aspect && Number.isFinite(aspect) && aspect > 0) return { width: 1123 * aspect, height: 1123 };
  return FORMAT_FRAME_PX['a4-portrait'];
}

/** Screen px per frame px when a page of `frame` is fitted into a `width × height` box (panel view, D3). */
export function pageScaleOnScreen(frame: { width: number; height: number }, width: number, height: number): number {
  if (!(frame.width > 0) || !(frame.height > 0) || !(width > 0) || !(height > 0)) return 1;
  return Math.min(width / frame.width, height / frame.height);
}

// ─── Shapes ─────────────────────────────────────────────────────────────────

export interface PanelBorderStroke {
  /** SVG path data in frame px (Path2D accepts it as well). */
  d: string;
  /** Stroke width, frame px. */
  width: number;
  /** Dash pattern, frame px; null = continuous. */
  dash: number[] | null;
  cap: 'butt' | 'round';
  join: 'miter' | 'round';
}

export type PanelBorderClip =
  | { kind: 'none' }
  /** Rounded rect at the frame edge. */
  | { kind: 'round'; radius: number }
  /** Closed outline, frame px. */
  | { kind: 'polygon'; points: [number, number][] };

export interface PanelBorderShape {
  strokes: PanelBorderStroke[];
  clip: PanelBorderClip;
}

const NO_CLIP: PanelBorderClip = { kind: 'none' };

/** Upper bound for outline samples (rough / wavy), whatever the frame size. */
const MAX_OUTLINE_SAMPLES = 1500;

function fmt(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundedRectPath(x0: number, y0: number, x1: number, y1: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  const [a, b, c, d] = [fmt(x0), fmt(y0), fmt(x1), fmt(y1)];
  if (r <= 0) return `M${a} ${b}H${c}V${d}H${a}Z`;
  const q = fmt(r);
  return (
    `M${fmt(x0 + r)} ${b}H${fmt(x1 - r)}A${q} ${q} 0 0 1 ${c} ${fmt(y0 + r)}` +
    `V${fmt(y1 - r)}A${q} ${q} 0 0 1 ${fmt(x1 - r)} ${d}` +
    `H${fmt(x0 + r)}A${q} ${q} 0 0 1 ${a} ${fmt(y1 - r)}` +
    `V${fmt(y0 + r)}A${q} ${q} 0 0 1 ${fmt(x0 + r)} ${b}Z`
  );
}

function rectStroke(
  w: number,
  h: number,
  inset: number,
  radius: number,
  width: number,
  dash: number[] | null,
  cap: 'butt' | 'round',
): PanelBorderStroke {
  return {
    d: roundedRectPath(inset, inset, w - inset, h - inset, Math.max(0, radius - inset)),
    width,
    dash,
    cap,
    join: 'miter',
  };
}

/** FNV-1a hash of a seed string (the panel id). */
export function panelBorderSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) in [0, 1). */
function random(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface OutlineSample {
  x: number;
  y: number;
  /** Outward normal; at a sharp corner the sum of both sides' normals (a miter). */
  nx: number;
  ny: number;
  /** Arc length from the start of the outline. */
  s: number;
}

/**
 * Samples along a rounded rect, clockwise from the top edge, about `step`
 * apart, with outward normals. Sharp corners (radius 0) get one corner sample.
 */
function sampleRoundedRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  step: number,
): { samples: OutlineSample[]; perimeter: number } {
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  interface Piece {
    length: number;
    at: (u: number) => [number, number, number, number];
  }
  const line = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number): Piece => ({
    length: Math.hypot(bx - ax, by - ay),
    at: (u) => [ax + (bx - ax) * u, ay + (by - ay) * u, nx, ny],
  });
  const corner = (cx: number, cy: number, from: number, nx: number, ny: number): Piece =>
    r > 0
      ? {
          length: (Math.PI / 2) * r,
          at: (u) => {
            const angle = from + (Math.PI / 2) * u;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return [cx + cos * r, cy + sin * r, cos, sin];
          },
        }
      : { length: 0, at: () => [cx, cy, nx, ny] };
  const pieces: Piece[] = [
    line(x0 + r, y0, x1 - r, y0, 0, -1),
    corner(x1 - r, y0 + r, -Math.PI / 2, 1, -1),
    line(x1, y0 + r, x1, y1 - r, 1, 0),
    corner(x1 - r, y1 - r, 0, 1, 1),
    line(x1 - r, y1, x0 + r, y1, 0, 1),
    corner(x0 + r, y1 - r, Math.PI / 2, -1, 1),
    line(x0, y1 - r, x0, y0 + r, -1, 0),
    corner(x0 + r, y0 + r, Math.PI, -1, -1),
  ];
  const perimeter = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const samples: OutlineSample[] = [];
  let s = 0;
  for (const piece of pieces) {
    const n = piece.length > 0 ? Math.max(1, Math.ceil(piece.length / step)) : 1;
    for (let i = 0; i < n; i++) {
      const u = piece.length > 0 ? i / n : 0;
      const [x, y, nx, ny] = piece.at(u);
      samples.push({ x, y, nx, ny, s: s + piece.length * u });
    }
    s += piece.length;
  }
  return { samples, perimeter };
}

/** Periodic smooth value noise over [0, period): `knots` random values in [-1, 1], cosine-interpolated. */
function periodicNoise(knots: number, rnd: () => number): (s: number, period: number) => number {
  const values = Array.from({ length: knots }, () => rnd() * 2 - 1);
  return (s, period) => {
    const pos = ((s / period) * knots) % knots;
    const i = Math.floor(pos);
    const f = pos - i;
    const a = values[i % knots];
    const b = values[(i + 1) % knots];
    const k = (1 - Math.cos(f * Math.PI)) / 2;
    return a + (b - a) * k;
  };
}

function outlineShape(points: [number, number][], thickness: number): PanelBorderShape {
  const d = 'M' + points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L') + 'Z';
  return {
    // Twice as thick on the outline; the clip keeps the inner half.
    strokes: [{ d, width: thickness * 2, dash: null, cap: 'round', join: 'round' }],
    clip: { kind: 'polygon', points: points.map(([x, y]) => [fmt(x), fmt(y)]) },
  };
}

function roughOutline(w: number, h: number, t: number, radius: number, seed: string): [number, number][] {
  const amplitude = 0.75 * t + 1;
  const inset = amplitude;
  const rnd = random(panelBorderSeed(seed || 'panel'));
  const approxPerimeter = 2 * (w + h);
  const step = Math.max(3, approxPerimeter / MAX_OUTLINE_SAMPLES);
  const { samples, perimeter } = sampleRoundedRect(inset, inset, w - inset, h - inset, Math.max(0, radius - inset), step);
  const coarse = periodicNoise(Math.max(4, Math.round(perimeter / 70)), rnd);
  const fine = periodicNoise(Math.max(12, Math.round(perimeter / 23)), rnd);
  return samples.map(({ x, y, nx, ny, s }) => {
    const offset = amplitude * (0.65 * coarse(s, perimeter) + 0.35 * fine(s, perimeter));
    return [x + nx * offset, y + ny * offset];
  });
}

function wavyOutline(w: number, h: number, t: number, radius: number): [number, number][] {
  const amplitude = Math.max(1.5 * t, 3);
  const inset = amplitude;
  const wavelength = 8 * amplitude;
  const approxPerimeter = 2 * (w + h);
  const step = Math.max(wavelength / 12, approxPerimeter / MAX_OUTLINE_SAMPLES);
  const { samples, perimeter } = sampleRoundedRect(
    inset,
    inset,
    w - inset,
    h - inset,
    Math.max(radius - inset, amplitude),
    step,
  );
  const waves = Math.max(4, Math.round(perimeter / wavelength));
  return samples.map(({ x, y, nx, ny, s }) => {
    const offset = amplitude * Math.sin((2 * Math.PI * waves * s) / perimeter);
    return [x + nx * offset, y + ny * offset];
  });
}

/**
 * The strokes and the clip of a border on a `width × height` frame (frame px).
 * `seed` (the panel id) makes `rough` stable across renders.
 */
export function panelBorderShape(
  border: ResolvedPanelBorder,
  width: number,
  height: number,
  seed = '',
): PanelBorderShape {
  if (!(width > 0) || !(height > 0)) return { strokes: [], clip: NO_CLIP };
  const half = Math.min(width, height) / 2;
  const radius = Math.min(border.radius, half);
  const roundClip: PanelBorderClip = radius > 0 ? { kind: 'round', radius: fmt(radius) } : NO_CLIP;
  if (!panelBorderHasLine(border)) return { strokes: [], clip: roundClip };
  const t = Math.min(border.thickness, half);
  switch (border.style) {
    case 'dashed':
      return { strokes: [rectStroke(width, height, t / 2, radius, t, [fmt(3 * t), fmt(2 * t)], 'butt')], clip: roundClip };
    case 'dotted':
      return { strokes: [rectStroke(width, height, t / 2, radius, t, [0, fmt(2 * t)], 'round')], clip: roundClip };
    case 'double':
      if (3 * t <= half) {
        return {
          strokes: [
            rectStroke(width, height, t / 2, radius, t, null, 'butt'),
            rectStroke(width, height, 2.5 * t, radius, t, null, 'butt'),
          ],
          clip: roundClip,
        };
      }
      break;
    case 'rough':
      return outlineShape(roughOutline(width, height, t, radius, seed), t);
    case 'wavy':
      return outlineShape(wavyOutline(width, height, t, radius), t);
  }
  return { strokes: [rectStroke(width, height, t / 2, radius, t, null, 'butt')], clip: roundClip };
}

function pct(value: number): string {
  return `${Math.round(value * 100000) / 1000}%`;
}

/**
 * The CSS `clip-path` of a frame for a clip (percentages, so it holds at any
 * rendered size of the same aspect); null when the frame's own box suffices.
 */
export function panelBorderClipPath(clip: PanelBorderClip, width: number, height: number): string | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (clip.kind === 'round') return `inset(0 round ${pct(clip.radius / width)} / ${pct(clip.radius / height)})`;
  if (clip.kind === 'polygon') {
    return `polygon(${clip.points.map(([x, y]) => `${pct(x / width)} ${pct(y / height)}`).join(',')})`;
  }
  return null;
}
