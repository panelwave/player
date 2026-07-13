/**
 * Balloon Configuration Utilities
 *
 * Provides default balloon config, merge logic, and conversion helpers
 * for rendering speech bubbles in the player.
 * Ported from CMS: apps/cms-frontend/src/app/core/models/balloon-config.model.ts
 */

import type { BalloonConfig, BalloonConfigOverride } from '../types';

/** Default balloon configuration */
export const DEFAULT_BALLOON_CONFIG: BalloonConfig = {
  balloonType: 'normal',
  cornerRadius: 0.5,
  maxWidth: 120,
  maxHeight: 80,
  fontFamily: "'Ames Italic', sans-serif",
  fontSize: 12,
  strokeWidth: 2,
  strokeColor: '#000000',
  fillColor: '#ffffff',
  tail: {
    enabled: true,
    position: 180,
    length: 45,
    curve: 'straight',
    curveAmount: 0.4,
  },
  hideBorder: {
    enabled: false,
    angle: 0,
    arc: 60,
  },
};

/**
 * Merge a partial override onto a base config, producing a complete config.
 * Handles nested tail and hideBorder objects.
 */
export function mergeBalloonConfig(base: BalloonConfig, override?: BalloonConfigOverride | null): BalloonConfig {
  if (!override) return { ...base };

  return {
    ...base,
    ...override,
    tail: {
      ...base.tail,
      ...(override.tail || {}),
    },
    hideBorder: {
      ...base.hideBorder,
      ...(override.hideBorder || {}),
    },
  };
}

/**
 * Convert a BalloonConfig to the options object expected by the ComicBalloon renderer.
 */
export function balloonConfigToRenderOptions(config: BalloonConfig): Record<string, unknown> {
  const type = config.balloonType;
  return {
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
    cornerRadius: type === 'rectangle' || type === 'narrator' ? 0 : config.cornerRadius,
    sharpCorners: type === 'narrator',
    isThought: type === 'thought',
    isShout: type === 'shout',
    isWhisper: type === 'whisper',
    cutTop: type === 'cutTop' || type === 'cutTopRight' || type === 'cutTopLeft',
    cutRight: type === 'cutTopRight',
    cutLeft: type === 'cutTopLeft',
    openTail: type === 'connector',
    fontFamily: config.fontFamily,
    fontSize: config.fontSize,
    strokeWidth: config.strokeWidth,
    strokeColor: config.strokeColor,
    fillColor: config.fillColor,
    hideBorder: config.hideBorder.enabled
      ? { angle: config.hideBorder.angle, arc: config.hideBorder.arc }
      : null,
  };
}

/**
 * Convert a BalloonConfig's tail settings to the tail options expected by the renderer.
 */
export function balloonConfigToTailOptions(config: BalloonConfig): { position: number; length: number; curve: string; curveAmount: number } | null {
  if (!config.tail.enabled && config.balloonType !== 'connector') {
    return null;
  }
  return {
    position: config.tail.position,
    length: config.tail.length,
    curve: config.tail.curve,
    curveAmount: config.tail.curveAmount,
  };
}
