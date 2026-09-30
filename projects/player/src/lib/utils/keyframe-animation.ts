/**
 * Layer keyframe animations (schema `PanelAnimations.keyframes`, 1.6+).
 *
 * Pure sampling logic — no DOM, no timers: keyframes are grouped into tracks
 * (one per layerId + property), a track is sampled at a time, and the sampled
 * values of a layer are turned into CSS values. The
 * `PanelAnimationDirective` drives this from a frame loop.
 *
 * Track rules (mirrors the schema description):
 *   - keyframes of a track are ordered by timeMs;
 *   - before the first keyframe the first value holds, after the last the
 *     last value holds;
 *   - between two keyframes the value is interpolated with the easing of the
 *     EARLIER keyframe (default `linear`).
 */
import type { AnimatableProperty, AnimationKeyframe, PanelAnimations } from '../types';
import { getEasingFunction, lerp } from './animation-utils';

/** Reference panel width `blur` values are authored against. */
export const KEYFRAME_BLUR_REFERENCE_WIDTH = 1024;

const ANIMATABLE: ReadonlySet<string> = new Set<AnimatableProperty>([
  'opacity',
  'transform.x',
  'transform.y',
  'transform.scale',
  'transform.rotation',
  'blur',
  'brightness',
  'contrast',
  'saturate',
]);

/** Sampled values of one layer at one point in time (absent = not animated). */
export type LayerAnimationState = Partial<Record<AnimatableProperty, number>>;

/** Keyframes grouped per layer, then per property, each track sorted by time. */
export type KeyframeTracks = Map<string, Map<AnimatableProperty, AnimationKeyframe[]>>;

/** CSS values for an animated layer; `null` means "leave / reset this property". */
export interface LayerAnimationStyles {
  opacity: string | null;
  translate: string | null;
  rotate: string | null;
  scale: string | null;
  filter: string | null;
}

function isUsable(kf: AnimationKeyframe | null | undefined): kf is AnimationKeyframe {
  return (
    !!kf &&
    typeof kf.layerId === 'string' &&
    kf.layerId.length > 0 &&
    ANIMATABLE.has(kf.property) &&
    Number.isFinite(kf.timeMs) &&
    kf.timeMs >= 0 &&
    Number.isFinite(kf.value)
  );
}

/** Whether a panel animation carries keyframes a player can run. */
export function hasKeyframes(animations: PanelAnimations | null | undefined): boolean {
  return !!animations && Array.isArray(animations.keyframes) && animations.keyframes.some(isUsable);
}

/** Group keyframes into sorted tracks; malformed keyframes are dropped. */
export function buildKeyframeTracks(keyframes: readonly AnimationKeyframe[] | null | undefined): KeyframeTracks {
  const tracks: KeyframeTracks = new Map();
  for (const kf of keyframes ?? []) {
    if (!isUsable(kf)) continue;
    let layer = tracks.get(kf.layerId);
    if (!layer) {
      layer = new Map();
      tracks.set(kf.layerId, layer);
    }
    const track = layer.get(kf.property);
    if (track) track.push(kf);
    else layer.set(kf.property, [kf]);
  }
  for (const layer of tracks.values()) {
    for (const track of layer.values()) {
      // Stable: keyframes sharing a time keep manifest order (the later one wins at that instant).
      track.sort((a, b) => a.timeMs - b.timeMs);
    }
  }
  return tracks;
}

/**
 * Running time of an animation: `durationMs`, else the time of the last
 * keyframe. 0 means "no motion, the end state applies immediately".
 */
export function keyframeAnimationDuration(animations: PanelAnimations | null | undefined): number {
  if (!animations) return 0;
  if (Number.isFinite(animations.durationMs) && (animations.durationMs as number) > 0) {
    return animations.durationMs as number;
  }
  let last = 0;
  for (const kf of animations.keyframes ?? []) {
    if (isUsable(kf) && kf.timeMs > last) last = kf.timeMs;
  }
  return last;
}

/** Value of one (sorted, non-empty) track at `timeMs`. */
export function sampleTrack(track: readonly AnimationKeyframe[], timeMs: number): number {
  const first = track[0];
  if (timeMs <= first.timeMs) return first.value;
  const last = track[track.length - 1];
  if (timeMs >= last.timeMs) return last.value;

  // Find the last keyframe at or before timeMs (tracks are short; linear scan).
  let i = 0;
  while (i + 1 < track.length && track[i + 1].timeMs <= timeMs) i++;
  const from = track[i];
  const to = track[i + 1];
  const span = to.timeMs - from.timeMs;
  if (span <= 0) return to.value;
  const progress = (timeMs - from.timeMs) / span;
  return lerp(from.value, to.value, getEasingFunction(from.easing ?? 'linear')(progress));
}

/** Sample every track: layerId -> animated property values at `timeMs`. */
export function sampleKeyframes(tracks: KeyframeTracks, timeMs: number): Map<string, LayerAnimationState> {
  const out = new Map<string, LayerAnimationState>();
  for (const [layerId, layer] of tracks) {
    const state: LayerAnimationState = {};
    for (const [property, track] of layer) {
      state[property] = sampleTrack(track, timeMs);
    }
    out.set(layerId, state);
  }
  return out;
}

/**
 * Timeline position for an elapsed time: clamped to the duration, or wrapped
 * when looping. `done` is true once a non-looping animation reached its end.
 */
export function animationTime(elapsedMs: number, durationMs: number, loop: boolean): { timeMs: number; done: boolean } {
  if (durationMs <= 0) return { timeMs: 0, done: true };
  if (loop) return { timeMs: elapsedMs % durationMs, done: false };
  return elapsedMs >= durationMs ? { timeMs: durationMs, done: true } : { timeMs: Math.max(0, elapsedMs), done: false };
}

const round = (value: number, digits = 3): number => {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
};

/**
 * CSS for a sampled layer state. Offsets are fractions of the panel box, blur
 * is authored at a 1024 px wide panel — both are resolved against the panel's
 * rendered size. Uses the individual transform properties (translate / rotate
 * / scale) so the layer's own `transform` stays untouched.
 */
export function layerAnimationStyles(
  state: LayerAnimationState,
  panelWidthPx: number,
  panelHeightPx: number
): LayerAnimationStyles {
  const opacity = state['opacity'];
  const tx = state['transform.x'];
  const ty = state['transform.y'];
  const scale = state['transform.scale'];
  const rotation = state['transform.rotation'];

  const filters: string[] = [];
  const blur = state['blur'];
  if (blur !== undefined && blur > 0) {
    const px = blur * (panelWidthPx > 0 ? panelWidthPx / KEYFRAME_BLUR_REFERENCE_WIDTH : 1);
    filters.push(`blur(${round(px, 2)}px)`);
  }
  for (const name of ['brightness', 'contrast', 'saturate'] as const) {
    const value = state[name];
    if (value !== undefined) filters.push(`${name}(${round(Math.max(0, value))})`);
  }

  return {
    opacity: opacity === undefined ? null : `${round(Math.min(1, Math.max(0, opacity)))}`,
    translate:
      tx === undefined && ty === undefined
        ? null
        : `${round((tx ?? 0) * panelWidthPx, 2)}px ${round((ty ?? 0) * panelHeightPx, 2)}px`,
    rotate: rotation === undefined ? null : `${round(rotation)}deg`,
    scale: scale === undefined ? null : `${round(Math.max(0, scale))}`,
    filter: filters.length > 0 ? filters.join(' ') : null,
  };
}
