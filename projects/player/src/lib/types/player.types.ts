/**
 * Player Type Definitions
 * Player-specific types for runtime state and configuration
 */

import type { PanelWaveManifest, LocaleCode, Chapter } from './manifest.types';
import type { Panel } from './panel.types';
import type { VariableStore } from './variable.types';

/**
 * Player options passed to the player component
 */
export interface PlayerOptions {
  /** Allow commenting features (optional, default: true) */
  allowComments?: boolean;
  
  /** Allow social features (like, share, bookmark) (optional, default: true) */
  allowSocial?: boolean;
  
  /** Theme preference (optional, default: "auto") */
  theme?: 'auto' | 'light' | 'dark';
  
  /** Enable debug mode (optional, default: false) */
  debug?: boolean;
  
  /** Custom CSS class for player container (optional) */
  className?: string;
  
  /** Enable keyboard shortcuts (optional, default: true) */
  enableKeyboard?: boolean;
  
  /** Enable touch gestures (optional, default: true) */
  enableTouch?: boolean;
}

/**
 * Deep link target for starting at a specific location
 */
export interface DeepLinkTarget {
  /** Chapter ID (optional) */
  chapterId?: string;
  
  /** Page ID (optional) */
  pageId?: string;
  
  /** Panel ID (optional) */
  panelId?: string;
  
  /** Variable snapshot hash (optional) */
  varSnapshotHash?: string;
}

/**
 * Player state (runtime)
 */
export interface PlayerState {
  /** Loaded manifest */
  manifest: PanelWaveManifest | null;
  
  /** Whether manifest is loaded */
  manifestLoaded: boolean;
  
  /** Manifest loading/parsing error (optional) */
  manifestError: string | null;
  
  /** Current work ID */
  currentWorkId: string | null;
  
  /** Current chapter ID */
  currentChapterId: string | null;
  
  /** Current page ID */
  currentPageId: string | null;
  
  /** Current panel ID */
  currentPanelId: string | null;
  
  /** Navigation history (panel IDs) */
  navigationHistory: string[];
  
  /** View mode */
  viewMode: ViewMode;
  
  /** Viewport state */
  viewport: ViewportState;
  
  /** Current locale */
  locale: LocaleCode;
  
  /** User preferences */
  preferences: PlayerPreferences;
  
  /** Variable store */
  variables: VariableStore;
  
  /** Entitlement status */
  entitlements: Record<string, boolean>;
  
  /** Current paywall gate (if any) */
  paywallGate: PaywallGate | null;
  
  /** Overlay visibility states */
  overlays: OverlayState;
  
  /** Tracking consent given */
  trackingConsent: boolean;
  
  /** Session ID */
  sessionId: string;
  
  /** Preload status */
  preloadStatus: PreloadStatus;
  
  /** Loading state */
  loading: boolean;
  
  /** Error state */
  error: PlayerError | null;
}

/**
 * View mode
 */
export type ViewMode = 'page' | 'panel' | 'canvas';

/**
 * Viewport state
 */
export interface ViewportState {
  /** Pan offset X */
  panX: number;
  
  /** Pan offset Y */
  panY: number;
  
  /** Zoom level */
  zoom: number;
  
  /** Viewport width */
  width: number;
  
  /** Viewport height */
  height: number;
  
  /** Whether viewport has overflow left */
  hasOverflowLeft: boolean;
  
  /** Whether viewport has overflow right */
  hasOverflowRight: boolean;
  
  /** Whether viewport has overflow top */
  hasOverflowTop: boolean;
  
  /** Whether viewport has overflow bottom */
  hasOverflowBottom: boolean;
}

/**
 * Player preferences (user-configurable)
 */
export interface PlayerPreferences {
  /** Show speech bubbles */
  speech: boolean;
  
  /** Enable audio */
  audio: boolean;
  
  /** Enable sound effects */
  sfx: boolean;
  
  /** Enable autoplay */
  autoplay: boolean;
  
  /** Seconds per panel in autoplay mode */
  secondsPerPanel: number;
  
  /** Manga mode (right-to-left reading) */
  mangaMode: boolean;
  
  /** Reduced motion */
  reducedMotion: boolean;
  
  /** High contrast mode */
  highContrast: boolean;
  
  /** Master volume (0-1) */
  masterVolume: number;
  
  /** SFX volume (0-1) */
  sfxVolume: number;
}

/**
 * Paywall gate information
 */
export interface PaywallGate {
  /** Gate scope */
  scope: 'work' | 'chapter' | 'panel';
  
  /** Reference ID (chapter or panel ID) (optional) */
  refId?: string;
  
  /** Required entitlement */
  requireEntitlement?: string;
  
  /** Reason for gate */
  reason: string;
}

/**
 * Overlay visibility state
 */
export interface OverlayState {
  /** Toolbar visible */
  toolbar: boolean;
  
  /** Thumbnails visible */
  thumbnails: boolean;
  
  /** Table of contents visible */
  toc: boolean;
  
  /** Settings modal visible */
  settings: boolean;
  
  /** Characters roster visible */
  characters: boolean;
  
  /** Extras viewer visible */
  extras: boolean;
  
  /** Comments drawer visible */
  comments: boolean;
  
  /** Share modal visible */
  share: boolean;
  
  /** Content warning overlay visible */
  contentWarning: boolean;
  
  /** Paywall overlay visible */
  paywall: boolean;
}

/**
 * Preload status
 */
export interface PreloadStatus {
  /** Number of items in queue */
  queueSize: number;
  
  /** Number of items currently loading */
  inFlight: number;
  
  /** Number of items completed */
  completed: number;
  
  /** Total items to preload */
  total: number;
}

/**
 * Player error
 */
export interface PlayerError {
  /** Error code */
  code: PlayerErrorCode;
  
  /** Error message */
  message: string;
  
  /** Detailed error information (optional) */
  details?: unknown;
  
  /** Whether error is recoverable */
  recoverable: boolean;
}

/**
 * Player error codes
 */
export type PlayerErrorCode =
  | 'MANIFEST_LOAD_FAILED'
  | 'MANIFEST_INVALID'
  | 'ASSET_LOAD_FAILED'
  | 'PANEL_NOT_FOUND'
  | 'CHAPTER_NOT_FOUND'
  | 'NAVIGATION_FAILED'
  | 'ENTITLEMENT_CHECK_FAILED'
  | 'PLUGIN_LOAD_FAILED'
  | 'UNKNOWN_ERROR';

/**
 * Player events
 */
export enum PlayerEvent {
  READY = 'ready',
  PANEL_CHANGE = 'panelChange',
  DECISION = 'decision',
  PAYWALL_SHOWN = 'paywallShown',
  ERROR = 'error',
  STATE_CHANGE = 'stateChange',
  PREFERENCE_CHANGE = 'preferenceChange',
  LOCALE_CHANGE = 'localeChange',

  /** A video layer started playing. */
  VIDEO_PLAY = 'videoPlay',
  /** A video layer paused. */
  VIDEO_PAUSE = 'videoPause',
  /**
   * A video finished (`once` mode ended) or was skipped by the sequencer
   * because it stalled (see `VideoTrackingPayload.reason`).
   */
  VIDEO_ENDED = 'videoEnded',
  /** A video completed one loop / pingpong / loop-from cycle. */
  VIDEO_LOOP = 'videoLoop',
}

/**
 * What triggered a video playback event, for analytics.
 */
export type VideoTrigger = 'view' | 'hover' | 'click' | 'sequencer';

/**
 * Payload emitted with the `VIDEO_*` player/tracking events.
 */
export interface VideoTrackingPayload {
  /** Panel the video layer belongs to (when known). */
  panelId?: string;
  /** Catalog asset id of the video (when known). */
  assetId?: string;
  /** What initiated the playback that produced this event. */
  trigger: VideoTrigger;
  /**
   * Reason qualifier for `VIDEO_ENDED` — `'ended'` for a genuine finish,
   * `'stall-skip'` when the sequencer skipped a stalled entry.
   */
  reason?: 'ended' | 'stall-skip';
}

/**
 * Player event data
 */
export interface PlayerEventData {
  /** Event type */
  type: PlayerEvent;
  
  /** Event payload */
  payload?: unknown;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Panel change event payload
 */
export interface PanelChangeEvent {
  /** Chapter ID */
  chapterId: string;
  
  /** Panel ID */
  panelId: string;
  
  /** Previous panel ID (optional) */
  previousPanelId?: string;
  
  /** Transition used */
  transition?: string;
}

/**
 * Payload of `<pw-player-shell>`'s `(panelChange)` output.
 *
 * Panels are keyed by id in `chapter.panels`; the optional `Panel.id` of the
 * format is not required and is usually absent, so read the id from
 * `panelId`, not from `panel`.
 */
export interface PlayerPanelChangeEvent {
  /** The panel that is now current (the manifest object, variants unresolved). */
  panel: Panel;

  /** The chapter the panel belongs to. */
  chapter: Chapter;

  /** Id of the current panel: its key in `chapter.panels`. */
  panelId: string;

  /**
   * Id of the panel that was current before this change (it may belong to
   * the previous chapter). Undefined for the first panel after a (re)load.
   */
  previousPanelId?: string;
}

/**
 * Decision event payload
 */
export interface DecisionEvent {
  /** Panel ID where decision was made */
  panelId: string;
  
  /** Choice/hotspot ID */
  choiceId: string;
  
  /** Chosen value (optional) */
  value?: unknown;
  
  /** Variables that were mutated */
  mutations?: Record<string, unknown>;
}

/**
 * Paywall event payload
 */
export interface PaywallEvent {
  /** Gate scope */
  scope: 'work' | 'chapter' | 'panel';
  
  /** Reference ID (optional) */
  refId?: string;
  
  /** Required entitlement */
  requireEntitlement?: string;
}

/**
 * Error event payload
 */
export interface ErrorEvent {
  /** Error code */
  code: string;
  
  /** Error message */
  message: string;
  
  /** Additional details (optional) */
  details?: unknown;
}

/**
 * Tracking configuration
 */
export interface TrackingConfig {
  /** Analytics endpoint URL (optional) */
  endpoint?: string;
  
  /** Event whitelist (optional) */
  whitelist?: string[];
  
  /** Whether tracking is enabled (optional, default: true if endpoint provided) */
  enabled?: boolean;
}

/**
 * Bookmark
 */
export interface Bookmark {
  /** Work ID */
  workId: string;
  
  /** Chapter ID */
  chapterId: string;
  
  /** Panel ID */
  panelId: string;
  
  /** Timestamp when bookmarked */
  timestamp: number;
  
  /** User note (optional) */
  note?: string;
}

/**
 * Reading progress
 */
export interface ReadingProgress {
  /** Work ID */
  workId: string;
  
  /** Last chapter ID visited */
  lastChapterId: string;
  
  /** Last panel ID visited */
  lastPanelId: string;
  
  /** Panels viewed */
  panelsViewed: string[];
  
  /** Percentage complete (0-100) */
  percentComplete: number;
  
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Player statistics
 */
export interface PlayerStatistics {
  /** Total time spent (milliseconds) */
  totalTimeMs: number;
  
  /** Number of panels viewed */
  panelsViewed: number;
  
  /** Number of decisions made */
  decisionsMade: number;
  
  /** Number of hotspots clicked */
  hotspotsClicked: number;
  
  /** Paths taken */
  pathsTaken: string[];
}
