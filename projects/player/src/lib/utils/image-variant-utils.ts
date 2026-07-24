/**
 * Image variant selection by required display width (canvas view
 * variant-by-zoom, integration spec §5): pick the smallest variant that
 * still covers the width a panel actually renders at — overview zoom
 * selects thumbnails, close-ups the full-resolution encode.
 */

import type { ImageVariant } from '../types';

/**
 * Select the image variant for a target display width in physical pixels
 * (CSS px × devicePixelRatio × zoom).
 *
 * - `targetWidthPx <= 0` keeps the legacy behavior (first variant).
 * - Otherwise: the smallest variant whose `w` covers the target, falling
 *   back to the largest available when none is big enough.
 * - Variants without a usable `w` only win when no variant declares one.
 */
export function selectImageVariantForWidth(
  variants: ImageVariant[] | undefined,
  targetWidthPx: number
): ImageVariant | undefined {
  if (!variants || variants.length === 0) {
    return undefined;
  }
  if (targetWidthPx <= 0) {
    return variants[0];
  }

  const sized = variants
    .filter((variant) => typeof variant.w === 'number' && variant.w > 0)
    .sort((a, b) => a.w - b.w);
  if (sized.length === 0) {
    return variants[0];
  }

  return sized.find((variant) => variant.w >= targetWidthPx) ?? sized[sized.length - 1];
}

/**
 * Quantize a required width so tiny zoom changes don't thrash variant
 * re-resolution (and never below one step).
 */
export function quantizeTargetWidth(widthPx: number, step = 256): number {
  return Math.max(step, Math.ceil(widthPx / step) * step);
}
