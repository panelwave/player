import { localizeImageVariants, quantizeTargetWidth, selectImageVariantForWidth } from './image-variant-utils';
import type { ImageVariant } from '../types';

describe('image-variant-utils', () => {
  const variants: ImageVariant[] = [
    { src: 'full.jpg', w: 2048, h: 1152 },
    { src: 'thumb.jpg', w: 256, h: 144 },
    { src: 'mid.jpg', w: 1024, h: 576 },
  ];

  describe('selectImageVariantForWidth', () => {
    it('keeps the legacy first-variant pick when no target width is given', () => {
      expect(selectImageVariantForWidth(variants, 0)?.src).toBe('full.jpg');
    });

    it('picks the smallest variant that covers the target width', () => {
      expect(selectImageVariantForWidth(variants, 200)?.src).toBe('thumb.jpg');
      expect(selectImageVariantForWidth(variants, 700)?.src).toBe('mid.jpg');
      expect(selectImageVariantForWidth(variants, 1024)?.src).toBe('mid.jpg');
      expect(selectImageVariantForWidth(variants, 1500)?.src).toBe('full.jpg');
    });

    it('falls back to the largest variant when none is big enough', () => {
      expect(selectImageVariantForWidth(variants, 5000)?.src).toBe('full.jpg');
    });

    it('falls back to the first variant when no variant declares a width', () => {
      const unsized = [{ src: 'a.jpg' }, { src: 'b.jpg' }] as ImageVariant[];
      expect(selectImageVariantForWidth(unsized, 800)?.src).toBe('a.jpg');
    });

    it('returns undefined for missing/empty variant lists', () => {
      expect(selectImageVariantForWidth(undefined, 800)).toBeUndefined();
      expect(selectImageVariantForWidth([], 800)).toBeUndefined();
    });
  });

  describe('localizeImageVariants', () => {
    const floor: ImageVariant[] = [
      { src: 'hello-2048.png', w: 2048, h: 1152 },
      { src: 'hello-1024.png', w: 1024, h: 576 },
      { src: 'hallo-2048.png', w: 2048, h: 1152, locale: 'de-DE' },
      { src: 'hallo-1024.png', w: 1024, h: 576, locale: 'de-DE' },
      { src: 'bonjour.png', w: 2048, h: 1152, locale: 'fr-FR' },
    ];
    const srcs = (list: ImageVariant[]) => list.map((variant) => variant.src);

    it('keeps the width ladder of the reader\'s locale', () => {
      expect(srcs(localizeImageVariants(floor, 'de-DE'))).toEqual(['hallo-2048.png', 'hallo-1024.png']);
      expect(selectImageVariantForWidth(localizeImageVariants(floor, 'de-DE'), 800)?.src).toBe('hallo-1024.png');
    });

    it('matches the locale case-insensitively and then by base language', () => {
      expect(srcs(localizeImageVariants(floor, 'de-de'))).toEqual(['hallo-2048.png', 'hallo-1024.png']);
      expect(srcs(localizeImageVariants(floor, 'de-AT'))).toEqual(['hallo-2048.png', 'hallo-1024.png']);
      expect(srcs(localizeImageVariants(floor, 'fr-CA'))).toEqual(['bonjour.png']);
    });

    it('serves the language-neutral variants to every other language', () => {
      expect(srcs(localizeImageVariants(floor, 'es-ES', 'de-DE'))).toEqual(['hello-2048.png', 'hello-1024.png']);
      expect(srcs(localizeImageVariants(floor, undefined))).toEqual(['hello-2048.png', 'hello-1024.png']);
    });

    it('falls back to the default locale when every variant is localized', () => {
      const localizedOnly = floor.filter((variant) => variant.locale);
      expect(srcs(localizeImageVariants(localizedOnly, 'es-ES', 'fr-FR'))).toEqual(['bonjour.png']);
      expect(srcs(localizeImageVariants(localizedOnly, 'es-ES', 'de-CH'))).toEqual(['hallo-2048.png', 'hallo-1024.png']);
      expect(localizeImageVariants(localizedOnly, 'es-ES')).toEqual(localizedOnly);
    });

    it('returns images without language versions unchanged', () => {
      expect(localizeImageVariants(variants, 'de-DE')).toBe(variants);
      expect(localizeImageVariants(undefined, 'de-DE')).toEqual([]);
    });
  });

  describe('quantizeTargetWidth', () => {
    it('rounds up to the step and never below one step', () => {
      expect(quantizeTargetWidth(1)).toBe(256);
      expect(quantizeTargetWidth(256)).toBe(256);
      expect(quantizeTargetWidth(257)).toBe(512);
      expect(quantizeTargetWidth(1000)).toBe(1024);
    });
  });
});
