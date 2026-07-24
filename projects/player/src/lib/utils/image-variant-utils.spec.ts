import { quantizeTargetWidth, selectImageVariantForWidth } from './image-variant-utils';
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

  describe('quantizeTargetWidth', () => {
    it('rounds up to the step and never below one step', () => {
      expect(quantizeTargetWidth(1)).toBe(256);
      expect(quantizeTargetWidth(256)).toBe(256);
      expect(quantizeTargetWidth(257)).toBe(512);
      expect(quantizeTargetWidth(1000)).toBe(1024);
    });
  });
});
