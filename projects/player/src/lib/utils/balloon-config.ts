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
  textFit: 'grow',
  fontFamily: "'Ames Italic', sans-serif",
  fontSize: 12,
  strokeWidth: 2,
  strokeColor: '#000000',
  fillColor: '#ffffff',
  textColor: '#000000',
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

/** Frame height that defines lettering scale 1 (DIN A4 portrait, 794×1123). */
export const LETTERING_BASE_HEIGHT = 1123;

/**
 * Base lettering scale for a panel whose artwork is shown at
 * `width × height` px — the CMS editor's panel-view rule: proportional to the
 * artwork, so a balloon keeps its size and place ON THE ARTWORK at every
 * player size (a narrow window or a phone shrinks the balloons with the
 * panel, their tails stay on the faces). Height-based, with artwork wider
 * than 16:9 counted as if it were 16:9 tall (a panorama strip must not
 * collapse the lettering). For artwork filling a 16:9 screen this equals the
 * screen height / 1123. pw-speech-bubbles raises small results to its
 * MIN_LETTERING_PX floor, keeping each tail tip in place.
 */
export function artworkLetteringScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.max(height, width * 9 / 16) / LETTERING_BASE_HEIGHT;
}

/**
 * Page view letters a page at this share of panel view's scale (a page
 * reads a little smaller than the panel shown full-frame — the CMS editor's
 * rule); on small pages the MIN_LETTERING_PX floor decides instead.
 */
export const PAGE_LETTERING_FACTOR = 0.75;

/**
 * Pages wider than Desktop (Bigscreen) hold more panels per page, so the
 * factor eases from PAGE_LETTERING_FACTOR at PAGE_LETTERING_WIDE_FROM CSS px
 * down to PAGE_LETTERING_FACTOR_WIDE at PAGE_LETTERING_WIDE_AT (the CMS
 * editor's rule, so editor and reader letter a page alike).
 */
export const PAGE_LETTERING_FACTOR_WIDE = 0.6;
export const PAGE_LETTERING_WIDE_FROM = 1920;
export const PAGE_LETTERING_WIDE_AT = 3840;

/** The page share for a page `pageWidth` CSS px wide (see PAGE_LETTERING_FACTOR_WIDE). */
export function pageLetteringFactor(pageWidth: number): number {
  if (!(pageWidth > PAGE_LETTERING_WIDE_FROM)) return PAGE_LETTERING_FACTOR;
  const t = Math.min(1, (pageWidth - PAGE_LETTERING_WIDE_FROM) / (PAGE_LETTERING_WIDE_AT - PAGE_LETTERING_WIDE_FROM));
  return PAGE_LETTERING_FACTOR + (PAGE_LETTERING_FACTOR_WIDE - PAGE_LETTERING_FACTOR) * t;
}

/**
 * Page view's uniform lettering scale for a page `pageWidth` CSS px wide:
 * pageLetteringFactor × panel view's artwork scale of a full-width
 * landscape (16:9) panel of that page (pageWidth × 9/16 / 1123) — one font
 * size is one size across the page, a balloon keeps its panel-view look.
 * pw-speech-bubbles raises small results to its MIN_LETTERING_PX floor.
 */
export function pageLetteringScale(pageWidth: number): number {
  return pageLetteringFactor(pageWidth) * artworkLetteringScale(pageWidth, pageWidth * 9 / 16);
}

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
    textFit: config.textFit === 'fixed' ? 'fixed' : 'grow',
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
    textColor: config.textColor,
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
