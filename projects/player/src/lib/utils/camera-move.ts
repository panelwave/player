/**
 * Panel camera moves (schema `PanelAnimations.startViewportRect` /
 * `endViewportRect`).
 *
 * A viewport rect is the part of the panel the reader sees, normalized to the
 * panel box (`{ x: 0, y: 0, w: 1, h: 1 }` = the whole panel). A camera move
 * travels from the start rect to the end rect over the animation's
 * `durationMs`, eased by `easing`.
 *
 * Pure logic — no DOM, no timers. The `PanelAnimationDirective` samples the
 * rect per frame and applies the resulting transform to the panel's content.
 *
 * Rules:
 *   - a missing rect is the whole panel, so "only an end rect" is a push-in
 *     from the full panel and "only a start rect" a pull-back to it;
 *   - a malformed rect (not finite, no area) counts as missing;
 *   - the rect is shown with a uniform scale (the artwork is never
 *     stretched): it is fitted into the panel box and centered, and the
 *     content never leaves the box uncovered — near an edge the rect sits
 *     off-centre rather than showing empty space.
 */
import type { NormalizedRect, PanelAnimations } from '../types';
import { getEasingFunction, lerp } from './animation-utils';
import { hasKeyframes, keyframeAnimationDuration } from './keyframe-animation';

/** The whole panel. */
export const FULL_VIEWPORT_RECT: Readonly<NormalizedRect> = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

/** Rects closer than this (in panel fractions) are the same rect. */
const RECT_EPSILON = 1e-4;

/** Content transform showing a viewport rect: `translate(x, y) scale(scale)` with origin 0 0. */
export interface CameraTransform {
  x: number;
  y: number;
  scale: number;
}

export const NO_CAMERA_TRANSFORM: Readonly<CameraTransform> = Object.freeze({ x: 0, y: 0, scale: 1 });

/**
 * A usable copy of a manifest viewport rect, clamped into the panel, or null
 * when the rect is missing or malformed.
 */
export function normalizeViewportRect(rect: NormalizedRect | null | undefined): NormalizedRect | null {
  if (!rect) return null;
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const width = Math.min(1, w);
  const height = Math.min(1, h);
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.min(Math.max(0, x), 1 - width),
    y: Math.min(Math.max(0, y), 1 - height),
    w: width,
    h: height,
  };
}

function sameRect(a: NormalizedRect, b: NormalizedRect): boolean {
  return (
    Math.abs(a.x - b.x) < RECT_EPSILON &&
    Math.abs(a.y - b.y) < RECT_EPSILON &&
    Math.abs(a.w - b.w) < RECT_EPSILON &&
    Math.abs(a.h - b.h) < RECT_EPSILON
  );
}

/** Start and end rect of a panel's camera move (missing = whole panel), or null when it has none. */
export function cameraMoveRects(
  animations: PanelAnimations | null | undefined
): { start: NormalizedRect; end: NormalizedRect } | null {
  if (!animations) return null;
  const start = normalizeViewportRect(animations.startViewportRect);
  const end = normalizeViewportRect(animations.endViewportRect);
  if (!start && !end) return null;
  const from = start ?? { ...FULL_VIEWPORT_RECT };
  const to = end ?? { ...FULL_VIEWPORT_RECT };
  // Both the whole panel: nothing to show differently.
  if (sameRect(from, FULL_VIEWPORT_RECT) && sameRect(to, FULL_VIEWPORT_RECT)) return null;
  return { start: from, end: to };
}

/** Whether a panel animation carries a camera move a player can run. */
export function hasCameraMove(animations: PanelAnimations | null | undefined): boolean {
  return cameraMoveRects(animations) !== null;
}

/**
 * The viewport rect at `timeMs` of a move running `durationMs`. Without a
 * duration there is no travel: the end rect applies.
 */
export function sampleViewportRect(
  start: NormalizedRect,
  end: NormalizedRect,
  timeMs: number,
  durationMs: number,
  easing: PanelAnimations['easing'] = 'linear'
): NormalizedRect {
  if (!(durationMs > 0) || timeMs >= durationMs) return { ...end };
  if (timeMs <= 0) return { ...start };
  const t = getEasingFunction(easing ?? 'linear')(timeMs / durationMs);
  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t),
    w: lerp(start.w, end.w, t),
    h: lerp(start.h, end.h, t),
  };
}

/**
 * Transform of the panel content (origin 0 0) that shows `rect` in a panel box
 * of `panelWidth` x `panelHeight` px: uniform scale so the rect fits the box,
 * rect centered, clamped so the content keeps covering the box.
 */
export function viewportRectTransform(rect: NormalizedRect, panelWidth: number, panelHeight: number): CameraTransform {
  if (!(panelWidth > 0) || !(panelHeight > 0) || !(rect.w > 0) || !(rect.h > 0)) {
    return { ...NO_CAMERA_TRANSFORM };
  }
  const scale = Math.max(1, Math.min(1 / rect.w, 1 / rect.h));
  const centerX = (rect.x + rect.w / 2) * panelWidth;
  const centerY = (rect.y + rect.h / 2) * panelHeight;
  const clampAxis = (offset: number, size: number): number => Math.min(0, Math.max(size - size * scale, offset));
  const x = clampAxis(panelWidth / 2 - centerX * scale, panelWidth);
  const y = clampAxis(panelHeight / 2 - centerY * scale, panelHeight);
  // Avoid "-0" in the CSS value.
  return { x: x || 0, y: y || 0, scale };
}

/**
 * How long a panel's animation plays before it rests: the running time of a
 * non-looping animation with keyframes or a camera move, else 0 (nothing to
 * wait for — a looping animation never ends).
 */
export function panelAnimationPlayTime(animations: PanelAnimations | null | undefined): number {
  if (!animations || animations.loop === true) return 0;
  if (!hasKeyframes(animations) && !hasCameraMove(animations)) return 0;
  return keyframeAnimationDuration(animations);
}

/** CSS `transform` for a camera transform, or null for the identity. */
export function cameraTransformCss(transform: CameraTransform): string | null {
  const x = Math.round(transform.x * 100) / 100;
  const y = Math.round(transform.y * 100) / 100;
  const scale = Math.round(transform.scale * 10000) / 10000;
  if (x === 0 && y === 0 && scale === 1) return null;
  return `translate(${x}px, ${y}px) scale(${scale})`;
}
