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
 * Narrow an image's variants to one language (schema 1.11
 * `ImageVariant.locale`) before choosing by width: the reader's exact
 * locale, else the first locale of the same base language (a de-AT reader
 * gets de-DE), else the variants without a locale, else the work's default
 * locale (exact, then same language), else all variants. Images without any
 * localized variant come back unchanged.
 */
export function localizeImageVariants<T extends { locale?: string }>(
  variants: T[] | undefined,
  locale: string | undefined,
  defaultLocale?: string
): T[] {
  if (!variants || variants.length === 0 || !variants.some((variant) => variant.locale)) {
    return variants ?? [];
  }
  const lower = (code: string) => code.toLowerCase();
  const language = (code: string) => lower(code).split('-')[0];
  const ofLocale = (code: string) => variants.filter((variant) => !!variant.locale && lower(variant.locale) === lower(code));
  const ofLanguage = (code: string) => {
    const match = variants.find((variant) => !!variant.locale && language(variant.locale) === language(code));
    return match?.locale ? ofLocale(match.locale) : [];
  };
  const neutral = () => variants.filter((variant) => !variant.locale);
  const candidates: (() => T[])[] = [];
  if (locale) {
    candidates.push(() => ofLocale(locale), () => ofLanguage(locale));
  }
  candidates.push(neutral);
  if (defaultLocale) {
    candidates.push(() => ofLocale(defaultLocale), () => ofLanguage(defaultLocale));
  }
  for (const candidate of candidates) {
    const set = candidate();
    if (set.length > 0) {
      return set;
    }
  }
  return variants;
}

/**
 * Quantize a required width so tiny zoom changes don't thrash variant
 * re-resolution (and never below one step).
 */
export function quantizeTargetWidth(widthPx: number, step = 256): number {
  return Math.max(step, Math.ceil(widthPx / step) * step);
}
