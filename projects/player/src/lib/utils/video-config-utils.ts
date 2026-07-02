/**
 * Video Config Utilities
 * Resolves the effective VideoLayer playback config from layer fields,
 * legacy schema 1.0 fields, and work-level `settings.ui` defaults.
 */

import type {
  VideoLayer,
  VideoPlayMode,
  VideoStartMode,
  UIDefaults,
} from '../types';

/** Built-in defaults (schema 1.1) */
export const DEFAULT_VIDEO_PLAY_MODE: VideoPlayMode = 'once';
export const DEFAULT_VIDEO_START_MODE: VideoStartMode = 'on-view';
export const DEFAULT_VIDEO_MUTED = true;

/**
 * Fully resolved, non-optional video playback configuration.
 */
export interface EffectiveVideoConfig {
  playMode: VideoPlayMode;
  startMode: VideoStartMode;
  muted: boolean;
  startAtMs: number;
  /** Only meaningful for playMode 'loop-from'; otherwise undefined. */
  loopFromMs?: number;
}

/**
 * Resolve the effective play mode.
 *
 * Precedence: explicit `playMode` (new field always wins) → legacy `loop: true`
 * ⇒ `loop` → work-level `videoPlayModeDefault` → built-in `once`.
 */
export function resolvePlayMode(
  layer: Partial<VideoLayer>,
  uiDefaults?: UIDefaults
): VideoPlayMode {
  if (layer.playMode) {
    return layer.playMode;
  }
  // Legacy mapping: loop: true ⇒ playMode 'loop'
  if (layer.loop === true) {
    return 'loop';
  }
  if (uiDefaults?.videoPlayModeDefault) {
    return uiDefaults.videoPlayModeDefault;
  }
  return DEFAULT_VIDEO_PLAY_MODE;
}

/**
 * Resolve the effective start mode.
 *
 * Precedence: explicit `startMode` (new field always wins) → legacy `autoplay`
 * (`true` ⇒ `on-view`, explicit `false` ⇒ `on-click`) → work-level
 * `videoStartModeDefault` → built-in `on-view`.
 */
export function resolveStartMode(
  layer: Partial<VideoLayer>,
  uiDefaults?: UIDefaults
): VideoStartMode {
  if (layer.startMode) {
    return layer.startMode;
  }
  // Legacy mapping: autoplay true ⇒ on-view, explicit false ⇒ on-click
  if (layer.autoplay === true) {
    return 'on-view';
  }
  if (layer.autoplay === false) {
    return 'on-click';
  }
  if (uiDefaults?.videoStartModeDefault) {
    return uiDefaults.videoStartModeDefault;
  }
  return DEFAULT_VIDEO_START_MODE;
}

/**
 * Resolve the effective muted state.
 *
 * Precedence: explicit layer `muted` → work-level `videoMutedDefault` → built-in
 * `true` (work-level default is muted).
 */
export function resolveMuted(
  layer: Partial<VideoLayer>,
  uiDefaults?: UIDefaults
): boolean {
  if (layer.muted !== undefined) {
    return layer.muted;
  }
  if (uiDefaults?.videoMutedDefault !== undefined) {
    return uiDefaults.videoMutedDefault;
  }
  return DEFAULT_VIDEO_MUTED;
}

/**
 * Resolve the full effective video config (play mode, start mode, muted,
 * startAtMs, loopFromMs) from a layer and optional work-level UI defaults.
 */
export function resolveVideoConfig(
  layer: Partial<VideoLayer>,
  uiDefaults?: UIDefaults
): EffectiveVideoConfig {
  const playMode = resolvePlayMode(layer, uiDefaults);
  return {
    playMode,
    startMode: resolveStartMode(layer, uiDefaults),
    muted: resolveMuted(layer, uiDefaults),
    startAtMs: typeof layer.startAtMs === 'number' ? Math.max(0, layer.startAtMs) : 0,
    loopFromMs: playMode === 'loop-from' ? layer.loopFromMs : undefined,
  };
}
