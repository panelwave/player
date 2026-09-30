/**
 * Focus-rect placement for panel view.
 *
 * A panel is shown at its natural size, centered in the viewport. On a screen
 * smaller than the panel (a phone showing a landscape panel) that crops the
 * panel around its middle. `Panel.formatViews[format].minimalFocusRect` names
 * the region that must stay visible on small screens — these helpers pick the
 * rect that applies to the current screen and compute where to place the
 * panel so the crop is centered on it.
 */
import type { FormatView, NormalizedRect } from '../types';

/** Width / height of each output format's frame (schema `OutputFormat`). */
export const OUTPUT_FORMAT_ASPECT: Readonly<Record<string, number>> = {
  'mobile-portrait': 375 / 667,
  'tablet-portrait': 768 / 1024,
  'a4-portrait': 794 / 1123,
  'us-portrait': 816 / 1056,
  square: 1,
  'a4-landscape': 1123 / 794,
  'us-landscape': 1056 / 816,
  'flex-landscape': 1280 / 800,
  'desktop-landscape': 16 / 9,
  'bigscreen-landscape': 16 / 9,
  'video-16-9': 16 / 9,
};

/** Placement of the panel box relative to its default (centered, unscaled) position. */
export interface PanelFocusTransform {
  /** Horizontal shift in px (positive = right). */
  offsetX: number;
  /** Vertical shift in px (positive = down). */
  offsetY: number;
  /** Scale factor (≤ 1: the panel only ever shrinks, to make the focus rect fit). */
  scale: number;
}

export const NO_FOCUS_TRANSFORM: PanelFocusTransform = Object.freeze({ offsetX: 0, offsetY: 0, scale: 1 });

function usableRect(rect: NormalizedRect | null | undefined): NormalizedRect | null {
  if (!rect) return null;
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every((v) => Number.isFinite(v))) return null;
  if (w <= 0 || h <= 0) return null;
  const cx = Math.min(1, Math.max(0, x));
  const cy = Math.min(1, Math.max(0, y));
  return { x: cx, y: cy, w: Math.min(w, 1 - cx), h: Math.min(h, 1 - cy) };
}

/**
 * The focus rect that applies on this screen: of the formats the panel
 * defines a `minimalFocusRect` for, the one whose frame is closest in aspect
 * ratio to the viewport (the player has no notion of an "active" output
 * format — the screen's shape stands in for it). Formats unknown to
 * {@link OUTPUT_FORMAT_ASPECT} are considered last. Null when the panel
 * defines none.
 */
export function pickFocusRect(
  formatViews: Record<string, FormatView> | null | undefined,
  viewportWidth: number,
  viewportHeight: number
): NormalizedRect | null {
  if (!formatViews || !(viewportWidth > 0) || !(viewportHeight > 0)) return null;
  const screen = Math.log(viewportWidth / viewportHeight);

  let best: NormalizedRect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [format, view] of Object.entries(formatViews)) {
    const rect = usableRect(view?.minimalFocusRect);
    if (!rect) continue;
    const aspect = OUTPUT_FORMAT_ASPECT[format];
    // Log-ratio distance: a 2:1 mismatch counts the same in either direction.
    const distance = aspect ? Math.abs(Math.log(aspect) - screen) : Number.MAX_VALUE;
    if (distance < bestDistance) {
      best = rect;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Where to place a `panelWidth × panelHeight` panel in the viewport so that
 * `rect` (normalized to the panel) stays visible:
 *
 *  - the panel shrinks just enough for the rect to fit the viewport (never grows);
 *  - the crop is centered on the rect's center;
 *  - the shift is limited so the panel keeps covering the viewport — an axis
 *    in which the (scaled) panel already fits stays centered.
 *
 * Without a rect, or when the whole panel fits, this is the identity.
 */
export function focusTransform(
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  rect: NormalizedRect | null | undefined
): PanelFocusTransform {
  const focus = usableRect(rect);
  if (!focus || !(panelWidth > 0) || !(panelHeight > 0) || !(viewportWidth > 0) || !(viewportHeight > 0)) {
    return NO_FOCUS_TRANSFORM;
  }

  const scale = Math.min(
    1,
    viewportWidth / (focus.w * panelWidth),
    viewportHeight / (focus.h * panelHeight)
  );
  const scaledWidth = panelWidth * scale;
  const scaledHeight = panelHeight * scale;

  const axis = (start: number, size: number, scaled: number, viewport: number): number => {
    const maxShift = Math.max(0, (scaled - viewport) / 2);
    const wanted = -((start + size / 2 - 0.5) * scaled); // bring the rect's center to the viewport's
    const shift = Math.min(maxShift, Math.max(-maxShift, wanted));
    return Math.round(shift * 100) / 100 + 0; // "+ 0": never -0
  };

  const offsetX = axis(focus.x, focus.w, scaledWidth, viewportWidth);
  const offsetY = axis(focus.y, focus.h, scaledHeight, viewportHeight);
  if (offsetX === 0 && offsetY === 0 && scale === 1) return NO_FOCUS_TRANSFORM;
  return { offsetX, offsetY, scale: Math.round(scale * 10000) / 10000 };
}
