/**
 * Unit tests for asset utilities
 */

import {
  resolveAssetUrl,
  isAbsoluteUrl,
  pickAssetBase,
  resolveManifestAssetUrl,
  selectBestImageVariant,
  selectVariantByFormat,
  getAssetFromCatalog,
  getFileExtension,
  guessMimeType,
  calculateOptimalDimensions,
  generateSrcSet,
  isMimeTypeSupported,
  estimateImageSize,
} from './asset-utils';
import type { AssetBase, ImageVariant, AssetCatalogItem } from '../types';

describe('AssetUtils', () => {
  describe('isAbsoluteUrl', () => {
    it('should return true for HTTP URLs', () => {
      expect(isAbsoluteUrl('http://example.com/image.jpg')).toBe(true);
      expect(isAbsoluteUrl('https://example.com/image.jpg')).toBe(true);
    });

    it('should return true for other protocols', () => {
      expect(isAbsoluteUrl('data:image/png;base64,abc123')).toBe(true);
      expect(isAbsoluteUrl('blob:http://example.com/123')).toBe(true);
      expect(isAbsoluteUrl('file:///path/to/file')).toBe(true);
    });

    it('should return false for relative URLs', () => {
      expect(isAbsoluteUrl('image.jpg')).toBe(false);
      expect(isAbsoluteUrl('/images/image.jpg')).toBe(false);
      expect(isAbsoluteUrl('../images/image.jpg')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isAbsoluteUrl('')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(isAbsoluteUrl(null as any)).toBe(false);
      expect(isAbsoluteUrl(undefined as any)).toBe(false);
    });
  });

  describe('resolveAssetUrl', () => {
    const assetBase: AssetBase = {
      mediaBase: 'https://cdn.example.com/',
      imageBase: 'https://cdn.example.com/images/',
      audioBase: 'https://cdn.example.com/audio/',
      videoBase: 'https://cdn.example.com/video/',
    };

    it('should return absolute URLs unchanged', () => {
      const url = 'https://other.com/image.jpg';
      expect(resolveAssetUrl(url, assetBase, 'image')).toBe(url);
    });

    it('should use category-specific base URL for images', () => {
      const result = resolveAssetUrl('hero.jpg', assetBase, 'image');
      expect(result).toBe('https://cdn.example.com/images/hero.jpg');
    });

    it('should use category-specific base URL for audio', () => {
      const result = resolveAssetUrl('music.mp3', assetBase, 'audio');
      expect(result).toBe('https://cdn.example.com/audio/music.mp3');
    });

    it('should use category-specific base URL for video', () => {
      const result = resolveAssetUrl('clip.mp4', assetBase, 'video');
      expect(result).toBe('https://cdn.example.com/video/clip.mp4');
    });

    it('should fall back to mediaBase when category base not available', () => {
      const minimalBase: AssetBase = {
        mediaBase: 'https://cdn.example.com/',
      };
      const result = resolveAssetUrl('file.jpg', minimalBase, 'image');
      expect(result).toBe('https://cdn.example.com/file.jpg');
    });

    it('should handle base URLs without trailing slash', () => {
      const noSlashBase: AssetBase = {
        imageBase: 'https://cdn.example.com/images',
      };
      const result = resolveAssetUrl('hero.jpg', noSlashBase, 'image');
      expect(result).toBe('https://cdn.example.com/images/hero.jpg');
    });

    it('should remove leading slash from asset ID', () => {
      const result = resolveAssetUrl('/hero.jpg', assetBase, 'image');
      expect(result).toBe('https://cdn.example.com/images/hero.jpg');
    });

    it('should return asset ID when no base provided', () => {
      expect(resolveAssetUrl('image.jpg', undefined, 'image')).toBe('image.jpg');
    });

    it('should return empty string for empty asset ID', () => {
      expect(resolveAssetUrl('', assetBase, 'image')).toBe('');
    });
  });

  describe('selectBestImageVariant', () => {
    const variants: ImageVariant[] = [
      { src: 'image-400.jpg', mime: 'image/jpeg', w: 400, h: 300 },
      { src: 'image-800.jpg', mime: 'image/jpeg', w: 800, h: 600 },
      { src: 'image-1600.jpg', mime: 'image/jpeg', w: 1600, h: 1200 },
      { src: 'image-3200.jpg', mime: 'image/jpeg', w: 3200, h: 2400 },
    ];

    it('should select exact match when available', () => {
      const result = selectBestImageVariant(variants, 800, 1);
      expect(result?.src).toBe('image-800.jpg');
    });

    it('should select next larger size when exact not available', () => {
      const result = selectBestImageVariant(variants, 500, 1);
      expect(result?.src).toBe('image-800.jpg');
    });

    it('should account for pixel density', () => {
      // 400px at 2x = 800px required
      const result = selectBestImageVariant(variants, 400, 2);
      expect(result?.src).toBe('image-800.jpg');
    });

    it('should return largest when all too small', () => {
      const result = selectBestImageVariant(variants, 2000, 2);
      expect(result?.src).toBe('image-3200.jpg');
    });

    it('should default to 1x density', () => {
      const result = selectBestImageVariant(variants, 500);
      expect(result?.src).toBe('image-800.jpg');
    });

    it('should return undefined for empty array', () => {
      expect(selectBestImageVariant([], 800, 1)).toBeUndefined();
    });

    it('should handle single variant', () => {
      const single = [variants[0]];
      const result = selectBestImageVariant(single, 1000, 2);
      expect(result?.src).toBe('image-400.jpg'); // Only option
    });
  });

  describe('selectVariantByFormat', () => {
    interface TestVariant {
      src: string;
      mime: string;
    }

    const variants: TestVariant[] = [
      { src: 'image.avif', mime: 'image/avif' },
      { src: 'image.webp', mime: 'image/webp' },
      { src: 'image.jpg', mime: 'image/jpeg' },
    ];

    it('should return first preferred format found', () => {
      const prefs = ['image/avif', 'image/webp', 'image/jpeg'];
      const result = selectVariantByFormat(variants, prefs);
      expect(result?.src).toBe('image.avif');
    });

    it('should skip unavailable formats', () => {
      const prefs = ['image/png', 'image/webp', 'image/jpeg'];
      const result = selectVariantByFormat(variants, prefs);
      expect(result?.src).toBe('image.webp');
    });

    it('should return first variant when no preference match', () => {
      const prefs = ['image/png', 'image/gif'];
      const result = selectVariantByFormat(variants, prefs);
      expect(result?.src).toBe('image.avif'); // First in array
    });

    it('should return undefined for empty array', () => {
      const result = selectVariantByFormat([], ['image/jpeg']);
      expect(result).toBeUndefined();
    });
  });

  describe('getAssetFromCatalog', () => {
    const catalog: AssetCatalogItem[] = [
      {
        id: 'img-1',
        category: 'image',
        variants: [{ src: 'test.jpg', mime: 'image/jpeg', w: 800, h: 600 }],
      },
      {
        id: 'aud-1',
        category: 'audio',
        variants: [{ src: 'test.mp3', mime: 'audio/mpeg' }],
      },
    ];

    it('should find asset by ID', () => {
      const result = getAssetFromCatalog(catalog, 'img-1');
      expect(result?.id).toBe('img-1');
    });

    it('should return undefined when not found', () => {
      const result = getAssetFromCatalog(catalog, 'non-existent');
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty catalog', () => {
      expect(getAssetFromCatalog([], 'img-1')).toBeUndefined();
    });

    it('should return undefined for undefined catalog', () => {
      expect(getAssetFromCatalog(undefined, 'img-1')).toBeUndefined();
    });

    it('should return undefined for empty asset ID', () => {
      expect(getAssetFromCatalog(catalog, '')).toBeUndefined();
    });
  });

  describe('getFileExtension', () => {
    it('should extract extension from filename', () => {
      expect(getFileExtension('image.jpg')).toBe('jpg');
      expect(getFileExtension('audio.mp3')).toBe('mp3');
      expect(getFileExtension('document.pdf')).toBe('pdf');
    });

    it('should extract extension from URL', () => {
      expect(getFileExtension('https://example.com/image.jpg')).toBe('jpg');
    });

    it('should handle query strings', () => {
      expect(getFileExtension('https://example.com/image.jpg?v=123')).toBe('jpg');
    });

    it('should handle hash fragments', () => {
      expect(getFileExtension('https://example.com/image.jpg#section')).toBe('jpg');
    });

    it('should return lowercase extension', () => {
      expect(getFileExtension('IMAGE.JPG')).toBe('jpg');
    });

    it('should return empty string for no extension', () => {
      expect(getFileExtension('README')).toBe('');
      expect(getFileExtension('https://example.com/path')).toBe('');
    });

    it('should handle multiple dots', () => {
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
    });

    it('should return empty string for empty input', () => {
      expect(getFileExtension('')).toBe('');
    });
  });

  describe('guessMimeType', () => {
    it('should guess MIME type for images', () => {
      expect(guessMimeType('image.jpg')).toBe('image/jpeg');
      expect(guessMimeType('image.png')).toBe('image/png');
      expect(guessMimeType('image.webp')).toBe('image/webp');
      expect(guessMimeType('image.svg')).toBe('image/svg+xml');
    });

    it('should guess MIME type for audio', () => {
      expect(guessMimeType('audio.mp3')).toBe('audio/mpeg');
      expect(guessMimeType('audio.ogg')).toBe('audio/ogg');
      expect(guessMimeType('audio.wav')).toBe('audio/wav');
    });

    it('should guess MIME type for video', () => {
      expect(guessMimeType('video.mp4')).toBe('video/mp4');
      expect(guessMimeType('video.webm')).toBe('video/webm');
    });

    it('should guess MIME type for documents', () => {
      expect(guessMimeType('document.pdf')).toBe('application/pdf');
      expect(guessMimeType('data.json')).toBe('application/json');
    });

    it('should handle uppercase extensions', () => {
      expect(guessMimeType('IMAGE.JPG')).toBe('image/jpeg');
    });

    it('should return default for unknown extensions', () => {
      expect(guessMimeType('file.unknown')).toBe('application/octet-stream');
    });

    it('should handle URLs', () => {
      expect(guessMimeType('https://example.com/image.jpg?v=1')).toBe('image/jpeg');
    });
  });

  describe('calculateOptimalDimensions', () => {
    it('should maintain aspect ratio when scaling down width', () => {
      const result = calculateOptimalDimensions(1920, 1080, 800, 600);
      expect(result.width).toBe(800);
      expect(result.height).toBe(450); // 16:9 ratio maintained
    });

    it('should maintain aspect ratio when scaling down height', () => {
      const result = calculateOptimalDimensions(1080, 1920, 800, 600);
      expect(result.width).toBe(337); // Maintains ratio
      expect(result.height).toBe(600);
    });

    it('should return original dimensions when within constraints', () => {
      const result = calculateOptimalDimensions(400, 300, 800, 600);
      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
    });

    it('should handle square images', () => {
      const result = calculateOptimalDimensions(1000, 1000, 500, 500);
      expect(result.width).toBe(500);
      expect(result.height).toBe(500);
    });

    it('should return zero dimensions for invalid input', () => {
      expect(calculateOptimalDimensions(0, 100, 800, 600)).toEqual({ width: 0, height: 0 });
      expect(calculateOptimalDimensions(100, 0, 800, 600)).toEqual({ width: 0, height: 0 });
      expect(calculateOptimalDimensions(-100, 100, 800, 600)).toEqual({ width: 0, height: 0 });
    });

    it('should round to integers', () => {
      const result = calculateOptimalDimensions(1000, 750, 333, 250);
      expect(Number.isInteger(result.width)).toBe(true);
      expect(Number.isInteger(result.height)).toBe(true);
    });
  });

  describe('generateSrcSet', () => {
    const variants: ImageVariant[] = [
      { src: 'image-400.jpg', mime: 'image/jpeg', w: 400, h: 300 },
      { src: 'image-800.jpg', mime: 'image/jpeg', w: 800, h: 600 },
      { src: 'image-1600.jpg', mime: 'image/jpeg', w: 1600, h: 1200 },
    ];

    it('should generate correct srcset string', () => {
      const result = generateSrcSet(variants);
      expect(result).toBe('image-400.jpg 400w, image-800.jpg 800w, image-1600.jpg 1600w');
    });

    it('should return empty string for empty array', () => {
      expect(generateSrcSet([])).toBe('');
    });

    it('should handle single variant', () => {
      const result = generateSrcSet([variants[0]]);
      expect(result).toBe('image-400.jpg 400w');
    });

    it('should handle null/undefined', () => {
      expect(generateSrcSet(null as any)).toBe('');
      expect(generateSrcSet(undefined as any)).toBe('');
    });
  });

  describe('isMimeTypeSupported', () => {
    it('should return true for commonly supported image types', () => {
      expect(isMimeTypeSupported('image/jpeg')).toBe(true);
      expect(isMimeTypeSupported('image/png')).toBe(true);
      expect(isMimeTypeSupported('image/webp')).toBe(true);
    });

    it('should return true for commonly supported audio types', () => {
      expect(isMimeTypeSupported('audio/mpeg')).toBe(true);
      expect(isMimeTypeSupported('audio/ogg')).toBe(true);
      expect(isMimeTypeSupported('audio/wav')).toBe(true);
    });

    it('should return true for commonly supported video types', () => {
      expect(isMimeTypeSupported('video/mp4')).toBe(true);
      expect(isMimeTypeSupported('video/webm')).toBe(true);
    });

    it('should return false for uncommon types', () => {
      expect(isMimeTypeSupported('image/avif')).toBe(false); // Not in common list
      expect(isMimeTypeSupported('video/x-matroska')).toBe(false);
    });
  });

  describe('estimateImageSize', () => {
    it('should estimate JPEG size', () => {
      const size = estimateImageSize(1920, 1080, 'image/jpeg');
      expect(size).toBeGreaterThan(0);
      // JPEG is ~10% of uncompressed (1920*1080*3*0.1 = ~622KB)
      expect(size).toBeCloseTo(622080, -4); // Within 10000
    });

    it('should estimate WebP size (smaller than JPEG)', () => {
      const jpegSize = estimateImageSize(1920, 1080, 'image/jpeg');
      const webpSize = estimateImageSize(1920, 1080, 'image/webp');
      expect(webpSize).toBeLessThan(jpegSize);
    });

    it('should estimate PNG size (larger than JPEG)', () => {
      const jpegSize = estimateImageSize(1920, 1080, 'image/jpeg');
      const pngSize = estimateImageSize(1920, 1080, 'image/png');
      expect(pngSize).toBeGreaterThan(jpegSize);
    });

    it('should return larger estimates for larger images', () => {
      const small = estimateImageSize(800, 600, 'image/jpeg');
      const large = estimateImageSize(1920, 1080, 'image/jpeg');
      expect(large).toBeGreaterThan(small);
    });

    it('should use default factor for unknown types', () => {
      const size = estimateImageSize(1920, 1080, 'image/unknown');
      expect(size).toBeGreaterThan(0);
    });
  });
});

describe('AssetUtils (category base selection)', () => {
  const full: AssetBase = {
    mediaBase: 'https://m.example/',
    imageBase: 'https://i.example/',
    audioBase: 'https://a.example/',
    videoBase: 'https://v.example/',
    pluginsBase: 'https://p.example/',
  };
  const mediaOnly: AssetBase = { mediaBase: 'https://m.example/' };
  const empty: AssetBase = {};

  const cases: [string, string, string][] = [
    // category, expected with full base, expected with media-only base
    ['image', 'https://i.example/x', 'https://m.example/x'],
    ['audio', 'https://a.example/x', 'https://m.example/x'],
    ['video', 'https://v.example/x', 'https://m.example/x'],
    ['subtitle', 'https://m.example/x', 'https://m.example/x'],
    ['vector', 'https://i.example/x', 'https://m.example/x'],
    ['json', 'https://m.example/x', 'https://m.example/x'],
    ['pluginPayload', 'https://p.example/x', 'https://m.example/x'],
  ];

  for (const [category, withFull, withMedia] of cases) {
    it(`resolves "${category}" against its dedicated base, then mediaBase, then nothing`, () => {
      const cat = category as Parameters<typeof resolveAssetUrl>[2];
      expect(resolveAssetUrl('x', full, cat)).toBe(withFull);
      expect(resolveAssetUrl('x', mediaOnly, cat)).toBe(withMedia);
      expect(resolveAssetUrl('/x', empty, cat)).toBe('x');
    });
  }

  it('uses mediaBase when no category is given and ignores unknown categories', () => {
    expect(resolveAssetUrl('x', full)).toBe('https://m.example/x');
    expect(resolveAssetUrl('x', full, 'hologram' as Parameters<typeof resolveAssetUrl>[2])).toBe('https://m.example/x');
    expect(resolveAssetUrl('x', empty)).toBe('x');
  });

  it('selectVariantByFormat derives a missing mime from the file extension', () => {
    const variants = [
      { src: 'a.jpg' },
      { src: 'a.webp' },
      { src: 'a.avif', mime: 'image/avif' },
    ];
    expect(selectVariantByFormat(variants, ['image/webp'])).toBe(variants[1]);
    expect(selectVariantByFormat(variants, ['image/avif'])).toBe(variants[2]);
    expect(selectVariantByFormat(variants, ['image/gif'])).toBe(variants[0]);
  });

  describe('resolveManifestAssetUrl', () => {
    const base: AssetBase = { mediaBase: 'https://cdn.example/works/w1/assets/', imageBase: 'https://img.example/' };

    it('passes absolute and data URLs through', () => {
      expect(resolveManifestAssetUrl('https://x/a.png', base, 'image', 'https://host/m.json')).toBe('https://x/a.png');
      expect(resolveManifestAssetUrl('data:image/png;base64,AA', base, 'image')).toBe('data:image/png;base64,AA');
    });

    it('prefers the category base, then mediaBase', () => {
      expect(resolveManifestAssetUrl('a.png', base, 'image')).toBe('https://img.example/a.png');
      expect(resolveManifestAssetUrl('video/c.mp4', base, 'video')).toBe('https://cdn.example/works/w1/assets/video/c.mp4');
      expect(pickAssetBase(base, 'audio')).toBe('https://cdn.example/works/w1/assets/');
      expect(pickAssetBase(undefined, 'audio')).toBe('');
    });

    it('falls back to the manifest URL like an HTML relative link', () => {
      expect(resolveManifestAssetUrl('assets/sha256-a/w1280.webp', undefined, 'image', 'https://host/tarmac/manifest.json'))
        .toBe('https://host/tarmac/assets/sha256-a/w1280.webp');
      expect(resolveManifestAssetUrl('../shared/x.png', {}, 'image', 'https://host/tarmac/manifest.json'))
        .toBe('https://host/shared/x.png');
    });

    it('returns the reference unchanged without any base', () => {
      expect(resolveManifestAssetUrl('a.png')).toBe('a.png');
      expect(resolveManifestAssetUrl('')).toBe('');
      expect(resolveManifestAssetUrl(undefined)).toBe('');
    });
  });
});
