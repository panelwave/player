/**
 * Asset Utilities
 * Helper functions for asset URL resolution and variant selection
 */

import type {
  AssetBase,
  AssetCatalogItem,
  AssetCategory,
  ImageVariant,
  AssetVariant,
} from '../types';

/**
 * Resolve an asset URL using base URLs and asset reference
 * 
 * @param assetId - Asset identifier or full URL
 * @param assetBase - Asset base URL configuration
 * @param category - Asset category for selecting appropriate base URL
 * @returns Resolved absolute URL
 * 
 * @example
 * ```typescript
 * const base = {
 *   imageBase: 'https://cdn.example.com/images/',
 *   audioBase: 'https://cdn.example.com/audio/'
 * };
 * 
 * resolveAssetUrl('hero.jpg', base, 'image');
 * // Returns: 'https://cdn.example.com/images/hero.jpg'
 * 
 * resolveAssetUrl('https://example.com/hero.jpg', base, 'image');
 * // Returns: 'https://example.com/hero.jpg' (already absolute)
 * ```
 */
export function resolveAssetUrl(
  assetId: string,
  assetBase?: AssetBase,
  category?: AssetCategory
): string {
  if (!assetId) {
    return '';
  }

  // If already an absolute URL, return as-is
  if (isAbsoluteUrl(assetId)) {
    return assetId;
  }

  // If no base URLs provided, return relative path
  if (!assetBase) {
    return assetId;
  }

  // Select appropriate base URL based on category
  let baseUrl = assetBase.mediaBase || '';

  if (category && assetBase) {
    switch (category) {
      case 'image':
        baseUrl = assetBase.imageBase || assetBase.mediaBase || '';
        break;
      case 'audio':
        baseUrl = assetBase.audioBase || assetBase.mediaBase || '';
        break;
      case 'video':
        baseUrl = assetBase.videoBase || assetBase.mediaBase || '';
        break;
      case 'subtitle':
        baseUrl = assetBase.mediaBase || '';
        break;
      case 'vector':
        baseUrl = assetBase.imageBase || assetBase.mediaBase || '';
        break;
      case 'json':
        baseUrl = assetBase.mediaBase || '';
        break;
      case 'pluginPayload':
        baseUrl = assetBase.pluginsBase || assetBase.mediaBase || '';
        break;
    }
  }

  // Ensure base URL ends with slash
  if (baseUrl && !baseUrl.endsWith('/')) {
    baseUrl += '/';
  }

  // Remove leading slash from asset ID if present
  const cleanAssetId = assetId.startsWith('/') ? assetId.slice(1) : assetId;

  return baseUrl + cleanAssetId;
}

/**
 * Check if a URL is absolute
 * 
 * @param url - URL to check
 * @returns True if URL is absolute (has protocol)
 */
export function isAbsoluteUrl(url: string): boolean {
  if (!url) {
    return false;
  }
  
  // Check for protocol (http://, https://, data:, blob:, etc.)
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

/**
 * Select the best image variant based on target dimensions and pixel density
 * 
 * @param variants - Array of image variants
 * @param targetWidth - Target width in pixels
 * @param pixelDensity - Device pixel ratio (default: 1)
 * @returns Best matching image variant
 * 
 * @example
 * ```typescript
 * const variants = [
 *   { src: 'hero-400.jpg', w: 400, h: 300, mime: 'image/jpeg' },
 *   { src: 'hero-800.jpg', w: 800, h: 600, mime: 'image/jpeg' },
 *   { src: 'hero-1600.jpg', w: 1600, h: 1200, mime: 'image/jpeg' }
 * ];
 * 
 * // For 500px wide display with 2x density (1000px actual)
 * selectBestImageVariant(variants, 500, 2);
 * // Returns: hero-1600.jpg (closest match >= 1000px)
 * ```
 */
export function selectBestImageVariant(
  variants: ImageVariant[],
  targetWidth: number,
  pixelDensity: number = 1
): ImageVariant | undefined {
  if (!variants || variants.length === 0) {
    return undefined;
  }

  // Calculate actual required width considering pixel density
  const requiredWidth = targetWidth * pixelDensity;

  // Sort variants by width
  const sorted = [...variants].sort((a, b) => a.w - b.w);

  // Find smallest variant that meets or exceeds required width
  const suitable = sorted.find((v) => v.w >= requiredWidth);
  
  // If found, return it; otherwise return largest available
  return suitable || sorted[sorted.length - 1];
}

/**
 * Select asset variant by preferred format/codec
 * 
 * @param variants - Array of asset variants
 * @param preferredFormats - Array of preferred MIME types in order
 * @returns Best matching variant, or first variant if no preference match
 * 
 * @example
 * ```typescript
 * const variants = [
 *   { src: 'image.avif', mime: 'image/avif', w: 1920, h: 1080 },
 *   { src: 'image.webp', mime: 'image/webp', w: 1920, h: 1080 },
 *   { src: 'image.jpg', mime: 'image/jpeg', w: 1920, h: 1080 }
 * ];
 * 
 * selectVariantByFormat(variants, ['image/avif', 'image/webp', 'image/jpeg']);
 * // Returns: { src: 'image.avif', ... } (first available in preference order)
 * ```
 */
export function selectVariantByFormat<T extends { src: string; mime?: string }>(
  variants: T[],
  preferredFormats: string[]
): T | undefined {
  if (!variants || variants.length === 0) {
    return undefined;
  }

  // Try each preferred format in order. A variant without an explicit mime
  // (optional since schema 1.2) is matched via its src file extension.
  for (const format of preferredFormats) {
    const match = variants.find((v) => (v.mime ?? guessMimeType(v.src)) === format);
    if (match) {
      return match;
    }
  }

  // Return first variant if no preference match
  return variants[0];
}

/**
 * Get asset from catalog by ID
 * 
 * @param catalog - Asset catalog array
 * @param assetId - Asset identifier
 * @returns Asset catalog item, or undefined if not found
 */
export function getAssetFromCatalog(
  catalog: AssetCatalogItem[] | undefined,
  assetId: string
): AssetCatalogItem | undefined {
  if (!catalog || !assetId) {
    return undefined;
  }

  return catalog.find((asset) => asset.id === assetId);
}

/**
 * Extract file extension from a filename or URL
 * 
 * @param filename - Filename or URL
 * @returns File extension (lowercase, without dot), or empty string
 * 
 * @example
 * ```typescript
 * getFileExtension('image.jpg');  // Returns: 'jpg'
 * getFileExtension('https://example.com/audio.mp3?v=1');  // Returns: 'mp3'
 * getFileExtension('document');  // Returns: ''
 * ```
 */
export function getFileExtension(filename: string): string {
  if (!filename) {
    return '';
  }

  // Remove query string and hash
  const cleanName = filename.split('?')[0].split('#')[0];

  // Extract extension
  const lastDot = cleanName.lastIndexOf('.');
  const lastSlash = cleanName.lastIndexOf('/');

  // Extension must be after the last slash (if any)
  if (lastDot > lastSlash && lastDot !== -1) {
    return cleanName.slice(lastDot + 1).toLowerCase();
  }

  return '';
}

/**
 * Guess MIME type from file extension
 * 
 * @param filename - Filename or URL
 * @returns Likely MIME type, or 'application/octet-stream' for unknown
 * 
 * @example
 * ```typescript
 * guessMimeType('image.jpg');  // Returns: 'image/jpeg'
 * guessMimeType('audio.mp3');  // Returns: 'audio/mpeg'
 * guessMimeType('video.mp4');  // Returns: 'video/mp4'
 * ```
 */
export function guessMimeType(filename: string): string {
  const extension = getFileExtension(filename);

  const mimeTypes: Record<string, string> = {
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    
    // Audio
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    
    // Video
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogv: 'video/ogg',
    mov: 'video/quicktime',
    m3u8: 'application/vnd.apple.mpegurl',
    
    // Subtitles
    vtt: 'text/vtt',
    srt: 'application/x-subrip',
    
    // Documents
    pdf: 'application/pdf',
    json: 'application/json',
    
    // Other
    txt: 'text/plain',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Calculate optimal image dimensions maintaining aspect ratio
 * 
 * @param originalWidth - Original image width
 * @param originalHeight - Original image height
 * @param maxWidth - Maximum width constraint
 * @param maxHeight - Maximum height constraint
 * @returns Optimal dimensions { width, height }
 * 
 * @example
 * ```typescript
 * calculateOptimalDimensions(1920, 1080, 800, 600);
 * // Returns: { width: 800, height: 450 } (maintains 16:9 aspect ratio)
 * ```
 */
export function calculateOptimalDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (originalWidth <= 0 || originalHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const aspectRatio = originalWidth / originalHeight;

  let width = originalWidth;
  let height = originalHeight;

  // Scale down if exceeds max width
  if (width > maxWidth) {
    width = maxWidth;
    height = width / aspectRatio;
  }

  // Scale down if exceeds max height
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * Generate srcset string for responsive images
 * 
 * @param variants - Array of image variants
 * @returns srcset string for use in <img> tag
 * 
 * @example
 * ```typescript
 * const variants = [
 *   { src: 'image-400.jpg', w: 400, h: 300, mime: 'image/jpeg' },
 *   { src: 'image-800.jpg', w: 800, h: 600, mime: 'image/jpeg' }
 * ];
 * 
 * generateSrcSet(variants);
 * // Returns: 'image-400.jpg 400w, image-800.jpg 800w'
 * ```
 */
export function generateSrcSet(variants: ImageVariant[]): string {
  if (!variants || variants.length === 0) {
    return '';
  }

  return variants
    .map((variant) => `${variant.src} ${variant.w}w`)
    .join(', ');
}

/**
 * Check if browser supports a MIME type
 * 
 * @param mimeType - MIME type to check
 * @returns True if likely supported (based on known formats)
 * 
 * Note: This is a heuristic check. For definitive support,
 * use HTMLMediaElement.canPlayType() at runtime.
 */
export function isMimeTypeSupported(mimeType: string): boolean {
  const commonlySupported = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'video/mp4',
    'video/webm',
    'text/vtt',
    'application/json',
  ];

  return commonlySupported.includes(mimeType);
}

/**
 * Estimate file size based on dimensions and format (rough heuristic)
 * 
 * @param width - Image width
 * @param height - Image height
 * @param mime - MIME type
 * @returns Estimated size in bytes
 * 
 * Note: This is a very rough estimate for planning purposes only
 */
export function estimateImageSize(
  width: number,
  height: number,
  mime: string
): number {
  const pixels = width * height;
  
  // Rough compression ratios
  const compressionFactors: Record<string, number> = {
    'image/jpeg': 0.1,      // ~10% of uncompressed
    'image/webp': 0.08,     // ~8% of uncompressed
    'image/avif': 0.05,     // ~5% of uncompressed
    'image/png': 0.3,       // ~30% of uncompressed (varies greatly)
    'image/gif': 0.15,      // ~15% of uncompressed
  };

  const factor = compressionFactors[mime] || 0.2;
  const uncompressedSize = pixels * 3; // RGB = 3 bytes per pixel

  return Math.round(uncompressedSize * factor);
}
