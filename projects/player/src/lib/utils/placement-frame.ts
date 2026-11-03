/**
 * Framed page placements (schema 1.13). A placement's `x`/`y`/`w`/`h` is the
 * panel's IMAGE BOX (the artwork's aspect ratio, normalized to the page; it
 * may leave the page), and the optional `vx`/`vy`/`vw`/`vh` quartet is the
 * FRAME: the window of that box the page shows. Page view renders the frame
 * as the panel — its border, hit area and focus ring — and the box inside it,
 * clipped, so an author can enlarge and move the artwork behind a fixed
 * frame. A placement without the quartet is its own frame.
 */
import type { PanelPlacement } from '../types';

/** A rectangle normalized to the page (0–1 = the page width / height). */
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Position and size of the image box as CSS percentages of its frame. */
export interface BoxStyle {
  left: string;
  top: string;
  width: string;
  height: string;
}

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** The frame's crop quartet with the schema defaults (whole box) filled in. */
export function placementCrop(placement: Pick<PanelPlacement, 'vx' | 'vy' | 'vw' | 'vh'>): {
  vx: number;
  vy: number;
  vw: number;
  vh: number;
} {
  const vw = Math.min(1, Math.max(0.001, num(placement.vw, 1)));
  const vh = Math.min(1, Math.max(0.001, num(placement.vh, 1)));
  return {
    vx: Math.min(1 - vw, Math.max(0, num(placement.vx, 0))),
    vy: Math.min(1 - vh, Math.max(0, num(placement.vy, 0))),
    vw,
    vh,
  };
}

/** Whether the placement shows only part of its image box. */
export function isFramedPlacement(placement: Pick<PanelPlacement, 'vx' | 'vy' | 'vw' | 'vh'>): boolean {
  const c = placementCrop(placement);
  return c.vw < 0.999 || c.vh < 0.999 || c.vx > 0.001 || c.vy > 0.001;
}

/** The frame on the page: `(x + vx·w, y + vy·h, vw·w, vh·h)`, normalized to the page. */
export function placementFrame(placement: PanelPlacement): FrameRect {
  const c = placementCrop(placement);
  const x = num(placement.x, 0);
  const y = num(placement.y, 0);
  const w = num(placement.w, 1);
  const h = num(placement.h, 1);
  return { x: x + c.vx * w, y: y + c.vy * h, w: c.vw * w, h: c.vh * h };
}

/**
 * The image box inside its frame element, in CSS percentages of the frame:
 * the box is `1 / vw` frame widths wide and starts `vx / vw` frame widths to
 * the left. An unframed placement is `0 / 0 / 100% / 100%`.
 */
export function placementBoxStyle(placement: Pick<PanelPlacement, 'vx' | 'vy' | 'vw' | 'vh'>): BoxStyle {
  const c = placementCrop(placement);
  const pct = (v: number) => `${Math.round(v * 100000) / 1000}%`;
  return {
    left: pct(-c.vx / c.vw),
    top: pct(-c.vy / c.vh),
    width: pct(1 / c.vw),
    height: pct(1 / c.vh),
  };
}

/** Bounding box of the frames of several placements, clamped to the page; null when there are none. */
export function framesBounds(placements: readonly PanelPlacement[]): FrameRect | null {
  if (!placements.length) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const frames = placements.map(placementFrame);
  const x0 = clamp(Math.min(...frames.map((f) => f.x)));
  const y0 = clamp(Math.min(...frames.map((f) => f.y)));
  const x1 = clamp(Math.max(...frames.map((f) => f.x + f.w)));
  const y1 = clamp(Math.max(...frames.map((f) => f.y + f.h)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
