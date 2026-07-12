/**
 * PanelWave Manifest Type Definitions
 * Based on schema version 1.0
 */

// Import types from other modules
import type {
  Panel,
  BalloonConfig,
  BalloonConfigOverride,
  VideoPlayMode,
  VideoStartMode,
} from './panel.types';
import type { Graph } from './graph.types';
import type { Assets } from './asset.types';
import type { Variables } from './variable.types';

/**
 * Root manifest structure for a PanelWave graphic novel
 */
export interface PanelWaveManifest {
  /** PanelWave header with version and schema information */
  panelwave: PanelwaveHeader;
  
  /** Metadata about the work */
  meta: Meta;
  
  /** Asset catalog and base URLs (optional) */
  assets?: Assets;
  
  /** Variable definitions for state management (optional) */
  variables?: Variables;
  
  /** Global settings for UI and behavior (optional) */
  settings?: Settings;
  
  /** Array of chapters containing panels and flow graphs */
  chapters: Chapter[];
  
  /** Extra content like covers, character sheets, bonus art (optional) */
  extras?: Extras;
  
  /** Paywall and entitlement rules (optional) */
  paywall?: Paywall;
  
  /** Analytics and tracking configuration (optional) */
  tracking?: Tracking;
  
  /** UI customization settings (optional) */
  ui?: UISettings;
  
  /** Custom extension properties starting with x- */
  [key: `x-${string}`]: unknown;
}

/**
 * PanelWave header with version information
 */
export interface PanelwaveHeader {
  /** Semantic version (e.g., "1.0.0") */
  version: string;
  
  /** URL to the JSON schema for this version */
  schema: string;
  
  /** Optional generator information */
  generator?: string;
}

/**
 * Metadata about the graphic novel work
 */
export interface Meta {
  /** Unique identifier for this work */
  id: string;
  
  /** Localized title */
  title: LocalizedString;
  
  /** Localized description (optional) */
  description?: LocalizedString;
  
  /** Array of creators with roles (optional) */
  creators?: Creator[];
  
  /** Publisher name (optional) */
  publisher?: string;
  
  /** Series name (optional) */
  series?: string;
  
  /** Issue designation (optional) */
  issue?: string;
  
  /** Release date in ISO format (YYYY-MM-DD) (optional) */
  release_date?: string;
  
  /** Age rating (e.g., "13+", "16+") (optional) */
  age_rating?: string;
  
  /** Array of tags for categorization (optional) */
  tags?: string[];
  
  /** List of supported locale codes */
  locales: LocaleCode[];
  
  /** Default locale for fallback */
  default_locale: LocaleCode;
  
  /** Cover image asset ID or URL (optional) */
  cover?: string;
  
  /** Character definitions (optional) */
  characters?: Character[];
  
  /** Content warning definitions (optional) */
  content_warnings?: ContentWarning[];
}

/**
 * Creator with role information
 */
export interface Creator {
  /** Role (e.g., "writer", "artist", "colorist") */
  role: string;
  
  /** Creator's name */
  name: string;
  
  /** URL to creator's website or profile (optional) */
  url?: string;
}

/**
 * Character definition
 */
export interface Character {
  /** Unique character identifier */
  id: string;
  
  /** Localized character name */
  name: LocalizedString;
  
  /** Localized character description (optional) */
  description?: LocalizedString;
  
  /** Character images by type (e.g., "portrait", "full-body") (optional) */
  images?: Record<string, string>;
  
  /** Voice synthesis configuration (optional) */
  voice?: {
    /** Voice provider (e.g., "elevenlabs", "custom") */
    provider: 'elevenlabs' | 'custom';
    
    /** Provider-specific voice ID */
    voiceId: string;
  };
  
  /** Per-character balloon style overrides (merged onto work-level defaults) */
  balloonConfig?: BalloonConfigOverride;
}

/**
 * Content warning definition
 */
export interface ContentWarning {
  /** Unique warning identifier */
  id: string;
  
  /** Localized warning label */
  label: LocalizedString;
  
  /** Whether to blur content by default (optional, default: false) */
  defaultBlur?: boolean;
}

/**
 * Sequence audio track that spans multiple panels
 */
export interface SequenceAudioTrack {
  /** Unique identifier for this audio track */
  id: string;
  
  /** Human-readable identifier */
  friendlyId: string;
  
  /** Display name for the track (optional) */
  name?: string;
  
  /** Reference to audio asset */
  assetId: string;
  
  /** Role/category of the audio track */
  role: 'ambient' | 'music' | 'voiceover' | 'sfx';
  
  /** Optional format filter (null = applies to all formats) */
  format?: 'tablet-portrait' | 'mobile-portrait' | 'bigscreen-landscape' | null;
  
  /** Start time in milliseconds relative to chapter/sequence start */
  startTime: number;
  
  /** Duration in milliseconds */
  duration: number;
  
  /** Volume/gain level (0.0 = silent, 1.0 = normal, 2.0 = double) */
  volume?: number;
  
  /** Whether the track should loop */
  loop?: boolean;
  
  /** Fade-in duration in milliseconds */
  fadeIn?: number;
  
  /** Fade-out duration in milliseconds */
  fadeOut?: number;
  
  /** Playback speed multiplier */
  playbackRate?: number;
  
  /** Whether the track is muted */
  muted?: boolean;
  
  /** Optional explicit panel range start */
  startPanelId?: string;
  
  /** Optional explicit panel range end */
  endPanelId?: string;
}

/**
 * Chapter containing panels and navigation graph
 */
export interface Chapter {
  /** Unique chapter identifier */
  id: string;
  
  /** Localized chapter title (optional) */
  title?: LocalizedString;
  
  /** Page layouts for multi-panel views (optional) */
  pages?: Page[];
  
  /** Dictionary of panels by ID */
  panels: Record<string, Panel>;
  
  /** Navigation graph defining flow between panels */
  graph: Graph;
  
  /** Sequence audio tracks that span multiple panels (optional) */
  sequenceAudioTracks?: SequenceAudioTrack[];
}

/**
 * Page layout for displaying multiple panels
 */
export interface Page {
  /** Unique page identifier */
  id: string;

  /** Localized page title (optional) */
  title?: LocalizedString;

  /** Layout configuration */
  layout: PageLayout;

  /** Reading order of panels on this page */
  readingOrder: string[];

  /** Transition effects for entering and leaving this page (optional) */
  transitions?: {
    /** Transition effect when entering this page */
    in?: Transition;

    /** Transition effect when leaving this page */
    out?: Transition;
  };
}

/**
 * Page layout configuration
 */
export interface PageLayout {
  /** Target output format */
  format: OutputFormat;
  
  /** Reference canvas size for CMS editor UI only (optional) */
  canvasSize?: {
    /** Canvas width in pixels */
    width: number;
    
    /** Canvas height in pixels */
    height: number;
  };
  
  /** Optional grid visual helper for CMS editor */
  gridHelper?: {
    /** Number of columns */
    cols: number;
    
    /** Number of rows */
    rows: number;
    
    /** Show grid in editor */
    visible: boolean;
    
    /** Enable snap-to-grid */
    snapEnabled: boolean;
    
    /** Snap threshold in normalized units (0.01 = 1%) */
    snapDistance: number;
  };
  
  /** Panel placements with absolute positioning */
  placements: PanelPlacement[];
}

/**
 * Panel placement with flexible absolute positioning
 */
export interface PanelPlacement {
  /** Panel ID to place */
  panelId: string;
  
  /** X position (normalized: 0 = left edge, 1 = right edge) */
  x: number;
  
  /** Y position (normalized: 0 = top edge, 1 = bottom edge) */
  y: number;
  
  /** Width (normalized: 0-1 = 0-100% of page width) */
  w: number;
  
  /** Height (normalized: 0-1 = 0-100% of page height) */
  h: number;
  
  /** Z-index for overlapping panels (higher = on top) */
  z?: number;
  
  /** Rotation in degrees (clockwise, -180 to 180) */
  r?: number;
  
  /** Transform origin point for rotation */
  origin?: {
    /** X origin (0 = left, 0.5 = center, 1 = right) */
    x: number;
    
    /** Y origin (0 = top, 0.5 = center, 1 = bottom) */
    y: number;
  };
  
  /** Visible area X position (normalized 0-1, relative to panel) */
  vx?: number;
  
  /** Visible area Y position (normalized 0-1, relative to panel) */
  vy?: number;
  
  /** Visible area width (normalized 0-1, relative to panel) */
  vw?: number;
  
  /** Visible area height (normalized 0-1, relative to panel) */
  vh?: number;
}

/**
 * Settings for global UI and preloading behavior
 */
export interface Settings {
  /** Typography and global styling defaults */
  typography?: {
    /** Default font family */
    default_font?: string;
    /** Default font size in points */
    default_font_size?: number;
    /** Default page background color */
    default_page_bg_color?: string;
    /** Default balloon styling for all speech bubbles in this work */
    balloon_config?: BalloonConfig;
  };
  
  /** UI defaults (optional) */
  ui?: UIDefaults;
  
  /** Preloading strategy (optional) */
  preload?: PreloadSettings;
  
  /** Output format presets (optional) */
  outputPresets?: Record<string, OutputPreset>;
}

/**
 * UI default settings
 */
export interface UIDefaults {
  /** Enable manga reading mode (right-to-left) (optional, default: false) */
  mangaMode?: boolean;
  
  /** Enable autoplay by default (optional, default: false) */
  autoplayDefault?: boolean;
  
  /** Seconds per panel in autoplay mode (optional) */
  secondsPerPanel?: number;
  
  /** Show speech bubbles by default (optional, default: true) */
  speechDefault?: boolean;
  
  /** Enable audio by default (optional, default: true) */
  audioDefault?: boolean;
  
  /** Enable SFX by default (optional, default: true) */
  sfxDefault?: boolean;
  
  /** Enable scrolling mode by default (optional, default: true) */
  scrollingDefault?: boolean;

  /** Work-level default VideoLayer playback mode (schema 1.1+, default 'once') */
  videoPlayModeDefault?: VideoPlayMode;

  /** Work-level default VideoLayer start trigger (schema 1.1+, default 'on-view') */
  videoStartModeDefault?: VideoStartMode;

  /** Work-level default for VideoLayer muted state (schema 1.1+, default true) */
  videoMutedDefault?: boolean;
}

/**
 * Preload configuration
 */
export interface PreloadSettings {
  /** Preload strategy */
  strategy?: 'none' | 'lookahead' | 'aggressive';
  
  /** Number of panels to preload ahead (optional, default: 2) */
  panelsAhead?: number;
  
  /** Maximum concurrent preload requests (optional, default: 4) */
  maxConcurrent?: number;
}

/**
 * Output format preset configuration
 */
export interface OutputPreset {
  /** Allow panel view mode */
  panelView?: boolean;
  
  /** Allow page view mode */
  pageView?: boolean;
  
  /** Default transition for this format (optional) */
  defaultTransition?: Transition;
}

/**
 * Extras collection (covers, bonus content, etc.)
 */
export interface Extras {
  /** Cover image(s) (optional) */
  cover?: ExtraItem;
  
  /** Alternative covers (optional) */
  alt_cover?: ExtraItem;
  
  /** Character sheets (optional) */
  character_sheets?: ExtraItem[];
  
  /** Author information (optional) */
  author_info?: ExtraItem;
  
  /** Author interviews (optional) */
  author_interviews?: ExtraItem[];
  
  /** Bonus artwork (optional) */
  bonus_art?: ExtraItem[];
  
  /** Fan art (optional) */
  fan_art?: ExtraItem[];
  
  /** Behind-the-scenes content (optional) */
  behind_the_scenes?: ExtraItem[];
  
  /** Custom extras */
  [key: string]: ExtraItem | ExtraItem[] | undefined;
}

/**
 * Extra content item
 */
export interface ExtraItem {
  /** Unique identifier */
  id: string;
  
  /** Localized title (optional) */
  title?: LocalizedString;
  
  /** Images for this extra (optional) */
  images?: ExtraImage[];
  
  /** Localized text content (optional) */
  text?: LocalizedString;
  
  /** Whether this extra can be shared (optional) */
  shareable?: boolean;
  
  /** Whether this extra is behind a paywall (optional) */
  gated?: boolean;
}

/**
 * Image in an extra item
 */
export interface ExtraImage {
  /** Asset ID */
  assetId: string;
  
  /** Localized caption (optional) */
  caption?: LocalizedString;
}

/**
 * Paywall and entitlement configuration
 */
export interface Paywall {
  /** Array of paywall rules */
  rules?: PaywallRule[];
}

/**
 * Paywall rule
 */
export interface PaywallRule {
  /** Scope of the rule */
  scope: 'work' | 'chapter' | 'panel';
  
  /** Reference ID (chapter ID or panel ID) (optional) */
  refId?: string;
  
  /** Required entitlement type */
  requireEntitlement?: 'premium' | 'token' | 'purchaseId';
  
  /** Number of preview panels allowed (optional) */
  previewPanels?: number;
}

/**
 * Tracking and analytics configuration
 */
export interface Tracking {
  /** Whether tracking is enabled */
  enabled?: boolean;
  
  /** Consent configuration (optional) */
  consent?: {
    /** Whether consent is required before tracking */
    required: boolean;
    
    /** Default opt-in state */
    defaultOptIn: boolean;
  };
  
  /** Whitelist of allowed event types (optional) */
  eventWhitelist?: string[];
  
  /** Analytics endpoint URL (optional) */
  endpoint?: string;
}

/**
 * UI customization settings
 */
export interface UISettings {
  /** Branding configuration (optional) */
  branding?: {
    /** Primary brand color (hex) */
    primaryColor?: string;
    
    /** Accent color (hex) */
    accentColor?: string;
    
    /** Brand logo asset ID or URL */
    logo?: string;
  };
  
  /** Control visibility configuration (optional) */
  controls?: {
    /** Show language toggle */
    showLanguageToggle?: boolean;
    
    /** Show autoplay toggle */
    showAutoplayToggle?: boolean;
    
    /** Show SFX toggle */
    showSfxToggle?: boolean;
  };
}

/**
 * Localized string dictionary
 */
export type LocalizedString = Record<LocaleCode, string>;

/**
 * Locale code (BCP-47 format)
 */
export type LocaleCode = string;

/**
 * Output format identifier
 */
export type OutputFormat =
  | 'flex-landscape'
  | 'mobile-portrait'
  | 'bigscreen-landscape'
  | 'a4-portrait'
  | 'a4-landscape'
  | 'us-portrait'
  | 'us-landscape'
  | 'video-16-9';

/**
 * Transition effect between panels
 */
export interface Transition {
  /** Transition type */
  type?: 'none' | 'cut' | 'fade' | 'slide' | 'zoom' | 'push' | 'cover';
  
  /** Direction for directional transitions (optional) */
  dir?: 'left' | 'right' | 'up' | 'down';
  
  /** Duration in milliseconds (optional) */
  durationMs?: number;
  
  /** Easing function (optional) */
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/**
 * Panel reference type
 */
export type PanelRef = string;

/**
 * Asset reference type
 */
export type AssetRef = string;
