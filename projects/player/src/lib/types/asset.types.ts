/**
 * Asset Type Definitions
 * Defines asset catalog structure and media variants
 */

import type { LocalizedString, LocaleCode } from './manifest.types';

/**
 * Assets configuration with base URLs and catalog
 */
export interface Assets {
  /** Base URL configuration (optional) */
  base?: AssetBase;
  
  /** Asset catalog array (optional) */
  catalog?: AssetCatalogItem[];
}

/**
 * Base URLs for different asset types
 */
export interface AssetBase {
  /** Base URL for all media (optional) */
  mediaBase?: string;
  
  /** Base URL for images (optional) */
  imageBase?: string;
  
  /** Base URL for audio files (optional) */
  audioBase?: string;
  
  /** Base URL for video files (optional) */
  videoBase?: string;
  
  /** Base URL for SFX files (optional) */
  sfxBase?: string;
  
  /** Base URL for thumbnails (optional) */
  thumbsBase?: string;
  
  /** Base URL for plugin payloads (optional) */
  pluginsBase?: string;
}

/**
 * Union type for all asset catalog item types
 */
export type AssetCatalogItem =
  | AssetCatalogItemImage
  | AssetCatalogItemAudio
  | AssetCatalogItemVideo
  | AssetCatalogItemSubtitle
  | AssetCatalogItemVector
  | AssetCatalogItemJson
  | AssetCatalogItemPluginPayload;

/**
 * Common properties for all asset types
 */
export interface AssetCommon {
  /** Unique asset identifier */
  id: string;
  
  /** Asset category/type */
  category: AssetCategory;
  
  /** Locale for this asset (optional) */
  locale?: LocaleCode;
  
  /** Localized alt text for accessibility (optional) */
  alt?: LocalizedString;
  
  /** Localized caption (optional) */
  caption?: LocalizedString;
  
  /** Localized transcript (optional) */
  transcript?: LocalizedString;
  
  /** Duration in milliseconds for time-based media (optional) */
  durationMs?: number;
  
  /** SHA-256 hash for integrity verification (optional) */
  sha256?: string;
  
  /** Tags for categorization (optional) */
  tags?: string[];
}

/**
 * Asset category discriminator
 */
export type AssetCategory =
  | 'image'
  | 'audio'
  | 'video'
  | 'subtitle'
  | 'vector'
  | 'json'
  | 'pluginPayload';

/**
 * Image asset catalog item
 */
export interface AssetCatalogItemImage extends AssetCommon {
  category: 'image';
  
  /** Array of image variants (different formats/resolutions) */
  variants: ImageVariant[];
}

/**
 * Image variant
 */
export interface ImageVariant {
  /** Source path or URL */
  src: string;

  /** MIME type (optional since schema 1.2; derived from the src file extension when omitted) */
  mime?: string;
  
  /** Width in pixels */
  w: number;
  
  /** Height in pixels */
  h: number;
  
  /** Pixel density multiplier (optional, e.g., 2 for @2x) */
  density?: number;
}

/**
 * Audio asset catalog item
 */
export interface AssetCatalogItemAudio extends AssetCommon {
  category: 'audio';
  
  /** Audio role/purpose (optional) */
  role?: AudioRole;
  
  /** Array of audio variants (different formats) */
  variants: AudioVariant[];
}

/**
 * Audio role classification
 */
export type AudioRole =
  | 'ambient'
  | 'music'
  | 'voiceover'
  | 'sfx'
  | 'ui'
  | 'none';

/**
 * Audio variant
 */
export interface AudioVariant {
  /** Source path or URL */
  src: string;

  /** MIME type (optional since schema 1.2; derived from the src file extension when omitted) */
  mime?: string;
  
  /** Bitrate in kbps (optional) */
  bitrateKbps?: number;
  
  /** Number of channels (optional) */
  channels?: number;
  
  /** Sample rate in Hz (optional) */
  sampleRateHz?: number;
  
  /** Whether this audio loops (optional) */
  loop?: boolean;
  
  /** Locale for this variant (optional) */
  locale?: LocaleCode;
}

/**
 * Video asset catalog item
 */
export interface AssetCatalogItemVideo extends AssetCommon {
  category: 'video';

  /** Array of video variants (different formats/resolutions) */
  variants: VideoVariant[];

  /**
   * Poster/preview frame shown before playback starts (schema 1.1+), e.g.
   * for click-to-play and reduced-motion presentations (optional).
   */
  poster?: VideoPoster;
}

/**
 * Poster/preview frame for a video asset.
 */
export interface VideoPoster {
  /** Source path or URL */
  src: string;

  /** MIME type (optional, must be an image/* type) */
  mime?: string;

  /** Width in pixels (optional) */
  w?: number;

  /** Height in pixels (optional) */
  h?: number;
}

/**
 * Video variant
 */
export interface VideoVariant {
  /** Source path or URL */
  src: string;

  /** MIME type (optional since schema 1.2; derived from the src file extension when omitted) */
  mime?: string;
  
  /** Width in pixels */
  w: number;
  
  /** Height in pixels */
  h: number;
  
  /** Frames per second (optional) */
  fps?: number;
  
  /** Codec identifier (optional) */
  codec?: string;
  
  /** Whether this is a streaming format (HLS/DASH) (optional) */
  streaming?: boolean;

  /** Locale for this variant (optional) */
  locale?: LocaleCode;

  /**
   * Playback direction of this variant (schema 1.1+, default 'forward').
   * `reverse` marks a pre-rendered, time-reversed encode used for smooth
   * `pingpong` playback; the player frame-steps when no reverse variant exists.
   */
  direction?: 'forward' | 'reverse';
}

/**
 * Subtitle/caption asset catalog item
 */
export interface AssetCatalogItemSubtitle extends AssetCommon {
  category: 'subtitle';
  
  /** Array of subtitle variants (different locales) */
  variants: SubtitleVariant[];
}

/**
 * Subtitle variant
 */
export interface SubtitleVariant {
  /** Source path or URL */
  src: string;
  
  /** MIME type */
  mime: 'text/vtt' | 'application/x-subrip';
  
  /** Locale for this subtitle track */
  locale: LocaleCode;
}

/**
 * Vector graphic asset catalog item (SVG, PDF)
 */
export interface AssetCatalogItemVector extends AssetCommon {
  category: 'vector';
  
  /** Array of vector variants */
  variants: VectorVariant[];
}

/**
 * Vector variant
 */
export interface VectorVariant {
  /** Source path or URL */
  src: string;
  
  /** MIME type */
  mime: 'image/svg+xml' | 'application/pdf';
}

/**
 * JSON data asset catalog item
 */
export interface AssetCatalogItemJson extends AssetCommon {
  category: 'json';
  
  /** Array of JSON variants */
  variants: JsonVariant[];
}

/**
 * JSON variant
 */
export interface JsonVariant {
  /** Source path or URL */
  src: string;
  
  /** MIME type */
  mime: 'application/json';
}

/**
 * Plugin payload asset catalog item
 */
export interface AssetCatalogItemPluginPayload extends AssetCommon {
  category: 'pluginPayload';
  
  /** Array of plugin payload variants */
  variants: JsonVariant[];
}

/**
 * Generic asset variant (union of all variant types)
 */
export type AssetVariant =
  | ImageVariant
  | AudioVariant
  | VideoVariant
  | SubtitleVariant
  | VectorVariant
  | JsonVariant;

/**
 * Asset reference with optional variant selection
 */
export interface AssetReference {
  /** Asset ID */
  assetId: string;
  
  /** Preferred variant index (optional) */
  variantIndex?: number;
  
  /** Preferred locale (optional) */
  locale?: LocaleCode;
}
