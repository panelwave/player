/**
 * Panel Type Definitions
 * Defines panel structure, layers, hotspots, speech bubbles, and variants
 */

import type { LocalizedString, Transition, AssetRef } from './manifest.types';

/**
 * Panel definition with layers, interactions, and metadata
 */
export interface Panel {
  /** Localized panel title (optional) */
  title?: LocalizedString;
  
  /** Localized panel description (optional) */
  description?: LocalizedString;
  
  /** Duration in milliseconds for autoplay (optional, defaults to player setting) */
  durationMs?: number;
  
  /** Format-specific view configurations (optional) */
  formatViews?: Record<string, FormatView>;
  
  /** Array of visual layers composing the panel */
  layers?: Layer[];
  
  /** Array of speech bubbles/dialogue (optional) */
  speechBubbles?: SpeechBubble[];
  
  /** Array of interactive hotspots (optional) */
  hotspots?: Hotspot[];

  /**
   * Audio tracks that play while this panel is current (schema `AudioTrack`).
   * Started by the shell on panel enter, stopped on leave; a looping track
   * referenced by consecutive panels keeps playing across them.
   */
  audio?: PanelAudioTrack[];

  /** Array of panel variants based on conditions (optional) */
  variants?: PanelVariant[];

  /**
   * Animation of the panel while it is shown (schema `PanelAnimations`):
   * layer keyframes (schema 1.6+) and/or a camera move.
   */
  animations?: PanelAnimations;

  /** Whether this panel can be shared socially (optional) */
  shareable?: boolean;
  
  /** Override for age rating (optional) */
  age_rating_override?: string;
  
  /** Content warnings that apply to this panel (optional) */
  contentWarnings?: string[];
  
  /** Asset IDs to preload before showing this panel (optional) */
  preloadHints?: string[];
  
  /** Memory budget hint in MB (optional) */
  memoryBudgetHint?: number;
  
  /** Plugin instances for this panel (optional) */
  plugins?: PluginInstance[];

  /**
   * Server-side paywall stub: public manifests strip the content of paid
   * panels and set this flag. The player renders a lock placeholder instead
   * of layers, bubbles and hotspots (see `isLockedPanel`).
   */
  'x-locked'?: boolean;
}

/**
 * Manifest audio role (schema `AudioTrack.role`). `ui` plays on the SFX bus,
 * `none` (the schema default) on the music bus.
 */
export type PanelAudioRole = 'ambient' | 'music' | 'voiceover' | 'sfx' | 'ui' | 'none';

/**
 * Panel-scoped audio track (schema `AudioTrack`, `panels.<id>.audio[]`).
 */
export interface PanelAudioTrack {
  /** Audio asset in the catalog */
  assetId: AssetRef;

  /** Bus the track plays on (optional, default: 'none') */
  role?: PanelAudioRole;

  /** Loop while the panel is current (optional, default: false) */
  loop?: boolean;

  /** Gain 0-2 (optional, default: 1) */
  gain?: number;

  /** Delay after panel enter before the track starts, in ms (optional) */
  startAtMs?: number;

  /** JSON Logic condition; the track only plays when it evaluates true (optional) */
  visibleIf?: JsonLogic;
}

/**
 * Layer property a keyframe animates (schema 1.6+).
 *
 * - `opacity`: 0-1, replaces the layer's opacity
 * - `transform.x` / `transform.y`: offset from the layer's resting position as a
 *   fraction of the panel's width / height (0.1 = 10 % right / down)
 * - `transform.scale`: scale factor around the layer's center (1 = unchanged)
 * - `transform.rotation`: degrees clockwise around the layer's center
 * - `blur`: blur radius in px at a panel width of 1024 px (scaled with the rendered panel)
 * - `brightness` / `contrast` / `saturate`: multiplier (1 = unchanged)
 */
export type AnimatableProperty =
  | 'opacity'
  | 'transform.x'
  | 'transform.y'
  | 'transform.scale'
  | 'transform.rotation'
  | 'blur'
  | 'brightness'
  | 'contrast'
  | 'saturate';

/** Easing names the schema allows on animations and keyframes. */
export type AnimationEasing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';

/**
 * One keyframe of a layer animation (schema `AnimationKeyframe`, 1.6+).
 */
export interface AnimationKeyframe {
  /** Keyframe identifier (optional) */
  id?: string;

  /** Id of the animated layer (`Panel.layers[].id`) */
  layerId: string;

  /** Animated property */
  property: AnimatableProperty;

  /** Position on the animation's timeline in milliseconds */
  timeMs: number;

  /** Property value at this keyframe (units: see {@link AnimatableProperty}) */
  value: number;

  /** Easing from this keyframe to the next one of the same track (default `linear`) */
  easing?: AnimationEasing;
}

/**
 * Panel animation (schema `PanelAnimations`).
 */
export interface PanelAnimations {
  /** Human-friendly name (authoring aid) */
  name?: string;

  /** Camera move start (normalized rect of the panel) */
  startViewportRect?: NormalizedRect;

  /** Camera move end (normalized rect of the panel) */
  endViewportRect?: NormalizedRect;

  /** Total running time; when omitted, keyframes run until their last keyframe */
  durationMs?: number;

  /** Easing of the camera move */
  easing?: AnimationEasing;

  /** Restart from 0 when durationMs is reached (default false) */
  loop?: boolean;

  /**
   * Layer keyframes. Keyframes with the same layerId + property form a track;
   * values hold before the first / after the last keyframe and are interpolated
   * in between with the earlier keyframe's easing.
   */
  keyframes?: AnimationKeyframe[];
}

/**
 * Format-specific view configuration
 */
export interface FormatView {
  /** Minimal focus rectangle for small screens (normalized 0-1) (optional) */
  minimalFocusRect?: NormalizedRect;
  
  /** Whether page view is allowed in this format (optional) */
  allowPageView?: boolean;
  
  /** Whether panel view is allowed in this format (optional) */
  allowPanelView?: boolean;
  
  /** Format-specific layer overrides (optional) */
  layers?: Layer[];
}

/**
 * Visual layer in a panel
 */
export interface Layer {
  /** Layer type/kind */
  kind: LayerKind;
  
  /** Unique layer identifier */
  id: string;
  
  /** Asset ID for this layer (optional, depends on kind) */
  assetId?: AssetRef;
  
  /** Z-index for layer ordering (optional, default: 0) */
  z?: number;
  
  /** Opacity (0-1) (optional, default: 1.0) */
  opacity?: number;
  
  /** Transform applied to this layer (optional) */
  transform?: Transform;
  
  /** Parallax depth for parallax scrolling effects (optional, default: 0) */
  parallaxDepth?: number;
  
  /** Whether this layer can be dragged to reveal content behind (optional) */
  dragReveal?: boolean;
  
  /** Clipping rectangle (normalized 0-1) (optional) */
  clipRect?: NormalizedRect;
  
  /** Condition for layer visibility (optional) */
  visibleIf?: JsonLogic;
  
  /** Layer-specific properties based on kind */
  [key: string]: unknown;
}

/**
 * Image layer
 */
export interface ImageLayer extends Layer {
  kind: 'image';
  assetId: AssetRef;
}

/**
 * Video playback mode (schema 1.1+).
 * - `once`: play through and freeze on the last frame.
 * - `loop`: play from startAtMs to the end, seek back, repeat.
 * - `pingpong`: play forward, then backward, then forward, repeating.
 * - `loop-from`: play once from startAtMs to the end, then loop from loopFromMs to the end.
 */
export type VideoPlayMode = 'once' | 'loop' | 'pingpong' | 'loop-from';

/**
 * Video start trigger (schema 1.1+).
 * - `on-view`: starts when the panel becomes current / enters the viewport.
 * - `on-hover`: starts on mouseover (page view only; falls back to on-click otherwise).
 * - `on-click`: starts on click/tap and toggles play/pause thereafter.
 */
export type VideoStartMode = 'on-view' | 'on-hover' | 'on-click';

/**
 * Video layer
 */
export interface VideoLayer extends Layer {
  kind: 'video';
  assetId: AssetRef;

  /** Autoplay video (optional, legacy schema 1.0 — superseded by startMode) */
  autoplay?: boolean;

  /** Loop video (optional, legacy schema 1.0 — superseded by playMode) */
  loop?: boolean;

  /** Muted by default (optional) */
  muted?: boolean;

  /** Start time in milliseconds (optional) */
  startAtMs?: number;

  /** Playback mode (schema 1.1+, default 'once'). Takes precedence over legacy `loop`. */
  playMode?: VideoPlayMode;

  /**
   * Loop re-entry point in milliseconds (schema 1.1+), only used when playMode is 'loop-from'.
   * Absolute media time, independent of startAtMs. Constraint: startAtMs <= loopFromMs < durationMs.
   */
  loopFromMs?: number;

  /** Start trigger (schema 1.1+, default 'on-view'). Takes precedence over legacy `autoplay`. */
  startMode?: VideoStartMode;
}

/**
 * Text layer
 */
export interface TextLayer extends Layer {
  kind: 'text';

  /** Localized text content */
  text: LocalizedString;

  /**
   * Name of a reusable text style preset in settings.typography.textStyles (schema 1.3+).
   * Resolution: work typography defaults -> preset -> inline `style` (inline wins).
   */
  styleRef?: string;

  /** Text styling (inline; overrides the styleRef preset field-by-field) */
  style?: TextStyle;
}

/**
 * Audio layer (for ambient/background sounds)
 */
export interface AudioLayer extends Layer {
  kind: 'audio';
  assetId: AssetRef;
  
  /** Loop audio (optional) */
  loop?: boolean;
  
  /** Volume level (0-1) (optional, default: 1.0) */
  volume?: number;
}

/**
 * Plugin layer
 */
export interface PluginLayer extends Layer {
  kind: 'plugin';
  
  /** Plugin type identifier */
  pluginType: string;
  
  /** Plugin-specific payload asset ID (optional) */
  payloadAssetId?: AssetRef;
}

/**
 * Layer kind discriminator
 */
export type LayerKind = 'image' | 'video' | 'text' | 'audio' | 'plugin' | 'hotspot' | 'button' | 'svg' | 'shape' | 'group';

/**
 * Text styling configuration
 */
export interface TextStyle {
  /** Font family (optional) */
  font?: string;
  
  /** Font size in points (optional) */
  sizePt?: number;
  
  /** Text color (hex) (optional) */
  color?: string;
  
  /** Stroke/outline color (hex) (optional) */
  strokeColor?: string;
  
  /** Stroke width in pixels (optional) */
  strokeWidth?: number;
  
  /** Text alignment (optional) */
  align?: 'left' | 'center' | 'right';
  
  /** Font weight (optional) */
  weight?: 'normal' | 'bold' | 'lighter' | 'bolder' | number;
}

/**
 * 2D transform
 */
export interface Transform {
  /** X translation (optional) */
  translateX?: number;
  
  /** Y translation (optional) */
  translateY?: number;
  
  /** Scale factor (optional) */
  scale?: number;
  
  /** Rotation in degrees (optional) */
  rotate?: number;
  
  /** Transform origin X (0-1) (optional, default: 0.5) */
  originX?: number;
  
  /** Transform origin Y (0-1) (optional, default: 0.5) */
  originY?: number;
}

/**
 * Speech bubble with dialogue
 */
export interface SpeechBubble {
  /** Unique bubble identifier */
  id: string;
  
  /** Character ID speaking (optional) */
  characterId?: string;
  
  /** Localized speech text */
  text: LocalizedString;
  
  /** Bounding box for bubble position and size (normalized 0-1 coordinates) */
  shape: BoundingBox;
  
  /** Tail pointing configuration (optional) */
  tail?: BubbleTail;
  
  /** Bubble styling (optional) */
  style?: BubbleStyle;

  /**
   * Name of a reusable balloon preset in settings.typography.balloonPresets (schema 1.3+).
   * Merge cascade: work balloon_config -> character balloonConfig -> preset -> inline balloonConfig.
   */
  styleRef?: string;

  /** Per-bubble balloon style overrides (merged onto the styleRef preset, character, or work-level defaults) */
  balloonConfig?: BalloonConfigOverride;
  
  /** Audio asset ID for voice-over (optional) */
  audioAssetId?: AssetRef;
  
  /** Condition for bubble visibility (optional) */
  visibleIf?: JsonLogic;
}

/**
 * Axis-aligned bounding box using normalized coordinates (0-1).
 * Used for speech bubble positioning within a panel.
 */
export interface BoundingBox {
  /** Left edge (0 = left, 1 = right) */
  x: number;
  /** Top edge (0 = top, 1 = bottom) */
  y: number;
  /** Width (fraction of container) */
  w: number;
  /** Height (fraction of container) */
  h: number;
}

/**
 * Speech bubble tail configuration
 */
export interface BubbleTail {
  /** Anchor point [x, y] (normalized 0-1) */
  anchor: [number, number];
  
  /** Target character ID or manual point (optional) */
  target?: string | [number, number];
}

/**
 * Speech bubble styling
 */
export interface BubbleStyle {
  /** Font family (optional) */
  font?: string;
  
  /** Font size in points (optional) */
  sizePt?: number;
  
  /** Bubble fill color (hex) (optional) */
  bubbleColor?: string;
  
  /** Text color (hex) (optional) */
  textColor?: string;
  
  /** Stroke/border color (hex) (optional) */
  strokeColor?: string;
  
  /** Stroke width in pixels (optional) */
  strokeWidth?: number;
}

/**
 * Balloon type discriminator
 */
export type BalloonType =
  | 'normal'
  | 'rectangle'
  | 'narrator'
  | 'cutTop'
  | 'cutTopRight'
  | 'cutTopLeft'
  | 'thought'
  | 'shout'
  | 'whisper'
  | 'connector';

/** Tail curve direction */
export type TailCurve = 'straight' | 'left' | 'right';

/** Tail configuration */
export interface TailConfig {
  enabled: boolean;
  /** 0-359 degrees (0=top, 90=right, 180=bottom, 270=left) */
  position: number;
  /** Length in pixels */
  length: number;
  curve: TailCurve;
  /** 0-1 curve intensity */
  curveAmount: number;
}

/** Border hiding configuration */
export interface HideBorderConfig {
  enabled: boolean;
  /** 0-359 degrees */
  angle: number;
  /** 10-180 degrees width */
  arc: number;
}

/**
 * Complete balloon configuration.
 * Used at work level (defaults), character level (overrides), and bubble level.
 */
export interface BalloonConfig {
  balloonType: BalloonType;
  /** 0-1 (0=rectangle, 1=ellipse) */
  cornerRadius: number;
  /** Pixels */
  maxWidth: number;
  /** Pixels */
  maxHeight: number;
  /** CSS font-family */
  fontFamily: string;
  /** Pixels */
  fontSize: number;
  /** 1-8 */
  strokeWidth: number;
  /** Hex color */
  strokeColor: string;
  /** Hex color */
  fillColor: string;
  tail: TailConfig;
  hideBorder: HideBorderConfig;
}

/**
 * Partial balloon config for character-level and bubble-level overrides.
 */
export type BalloonConfigOverride = Partial<BalloonConfig> & {
  tail?: Partial<TailConfig>;
  hideBorder?: Partial<HideBorderConfig>;
};

/**
 * Interactive hotspot
 */
export interface Hotspot {
  /** Unique hotspot identifier */
  id: string;

  /** Hotspot shape definition */
  shape: HotspotShape;

  /** Localized label */
  label: LocalizedString;

  /** Localized accessibility label (optional, overrides label for screen readers) */
  ariaLabel?: LocalizedString;

  /** Action to perform when activated */
  action: HotspotAction;

  /** Condition for hotspot visibility (optional) */
  visibleIf?: JsonLogic;
}

/**
 * Hotspot shape
 */
export type HotspotShape =
  | HotspotRect
  | HotspotCircle
  | HotspotPolygon;

/**
 * Rectangular hotspot
 */
export interface HotspotRect {
  type: 'rect';
  
  /** X position (normalized 0-1) */
  x: number;
  
  /** Y position (normalized 0-1) */
  y: number;
  
  /** Width (normalized 0-1) */
  w: number;
  
  /** Height (normalized 0-1) */
  h: number;
}

/**
 * Circular hotspot
 */
export interface HotspotCircle {
  type: 'circle';
  
  /** Center X (normalized 0-1) */
  cx: number;
  
  /** Center Y (normalized 0-1) */
  cy: number;
  
  /** Radius (normalized 0-1) */
  r: number;
}

/**
 * Polygonal hotspot
 */
export interface HotspotPolygon {
  type: 'polygon';
  
  /** Array of points [x, y] (normalized 0-1) */
  points: [number, number][];
}

/**
 * Hotspot action (discriminated union matching the schema's HotspotAction oneOf)
 */
export type HotspotAction =
  | HotspotGoToAction
  | HotspotSetVariablesAction
  | HotspotOpenExtrasAction
  | HotspotOpenModalAction
  | HotspotPluginEventAction;

/**
 * Navigate to another panel, optionally applying mutations and a transition
 */
export interface HotspotGoToAction {
  type: 'goTo';

  /** Target panel ID */
  to: string;

  /** Variable mutations applied before navigating (optional) */
  mutations?: Mutation[];

  /** Transition to use (optional) */
  transition?: Transition;
}

/**
 * Apply variable mutations without navigating
 */
export interface HotspotSetVariablesAction {
  type: 'setVariables';

  /** Variable mutations to apply */
  mutations: Mutation[];
}

/**
 * Open the extras viewer at a specific item
 */
export interface HotspotOpenExtrasAction {
  type: 'openExtras';

  /** Extras item ID to open */
  extrasId: string;
}

/**
 * Open a simple modal with localized title and content
 */
export interface HotspotOpenModalAction {
  type: 'openModal';

  /** Localized modal title */
  title: LocalizedString;

  /** Localized modal body text */
  content: LocalizedString;
}

/**
 * Dispatch an event to a plugin
 */
export interface HotspotPluginEventAction {
  type: 'pluginEvent';

  /** Target plugin ID */
  pluginId: string;

  /** Event name */
  event: string;

  /** Event payload (optional) */
  payload?: unknown;
}

/**
 * The subset of Panel a variant may override (schema `PanelPartial`).
 * Variants do not recurse, so `variants` itself is excluded; every
 * present property REPLACES the base panel's value wholesale.
 */
export type PanelPartial = Partial<Omit<Panel, 'variants'>>;

/**
 * Panel variant based on conditions. Variants are evaluated in
 * manifest order; the first whose `when` matches the variable context
 * applies.
 */
export interface PanelVariant {
  /** Unique variant identifier */
  id: string;

  /** Condition for this variant to apply */
  when: JsonLogic;

  /** Property overrides for this variant */
  overrides: PanelPartial;
}

/**
 * Plugin instance configuration
 */
export interface PluginInstance {
  /** Plugin type identifier */
  pluginType: string;
  
  /** Plugin instance ID */
  instanceId: string;
  
  /** Plugin-specific configuration (optional) */
  config?: Record<string, unknown>;
  
  /** Payload asset ID (optional) */
  payloadAssetId?: AssetRef;
}

/**
 * Normalized rectangle (coordinates 0-1)
 */
export interface NormalizedRect {
  /** X position (0-1) */
  x: number;
  
  /** Y position (0-1) */
  y: number;
  
  /** Width (0-1) */
  w: number;
  
  /** Height (0-1) */
  h: number;
}

/**
 * Normalized point (coordinates 0-1)
 */
export type NormalizedPoint = [number, number];

/**
 * JSON Logic expression (generic)
 */
export type JsonLogic = boolean | number | string | null | JsonLogicExpression | JsonLogicExpression[];

/**
 * JSON Logic expression object
 */
export type JsonLogicExpression = Record<string, unknown>;

/**
 * Variable mutation
 */
export interface Mutation {
  /** Mutation operation */
  op: 'set' | 'increment' | 'decrement' | 'toggle' | 'append' | 'remove';
  
  /** Variable identifier */
  var: string;
  
  /** Value for the operation (optional, depends on op) */
  value?: unknown;
}
