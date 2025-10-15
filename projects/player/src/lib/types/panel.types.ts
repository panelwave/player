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
  
  /** Array of panel variants based on conditions (optional) */
  variants?: PanelVariant[];
  
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
 * Video layer
 */
export interface VideoLayer extends Layer {
  kind: 'video';
  assetId: AssetRef;
  
  /** Autoplay video (optional) */
  autoplay?: boolean;
  
  /** Loop video (optional) */
  loop?: boolean;
  
  /** Muted by default (optional) */
  muted?: boolean;
  
  /** Start time in milliseconds (optional) */
  startAtMs?: number;
}

/**
 * Text layer
 */
export interface TextLayer extends Layer {
  kind: 'text';
  
  /** Localized text content */
  text: LocalizedString;
  
  /** Text styling */
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
  
  /** Bubble shape and position */
  shape: BubbleShape;
  
  /** Tail pointing configuration (optional) */
  tail?: BubbleTail;
  
  /** Bubble styling (optional) */
  style?: BubbleStyle;
  
  /** Audio asset ID for voice-over (optional) */
  audioAssetId?: AssetRef;
  
  /** Condition for bubble visibility (optional) */
  visibleIf?: JsonLogic;
}

/**
 * Speech bubble shape
 */
export interface BubbleShape {
  /** Shape type */
  type: 'ellipse' | 'rect' | 'rounded-rect' | 'cloud' | 'thought';
  
  /** X position (normalized 0-1) */
  x: number;
  
  /** Y position (normalized 0-1) */
  y: number;
  
  /** Width (normalized 0-1) */
  w: number;
  
  /** Height (normalized 0-1) */
  h: number;
  
  /** Border radius for rounded shapes (optional) */
  radius?: number;
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
 * Interactive hotspot
 */
export interface Hotspot {
  /** Unique hotspot identifier */
  id: string;
  
  /** Hotspot shape definition */
  shape: HotspotShape;
  
  /** Localized accessibility label */
  label: LocalizedString;
  
  /** Action to perform when activated */
  action: HotspotAction;
  
  /** Condition for hotspot availability (optional) */
  enabledIf?: JsonLogic;
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
 * Hotspot action
 */
export interface HotspotAction {
  /** Action type */
  type: 'goTo' | 'setVariables' | 'openExtras' | 'openModal' | 'pluginEvent';
  
  /** Target panel ID (for goTo) (optional) */
  to?: string;
  
  /** Variable mutations to apply (optional) */
  mutations?: Mutation[];
  
  /** Transition to use (for goTo) (optional) */
  transition?: Transition;
  
  /** Extra item ID to open (for openExtras) (optional) */
  extraId?: string;
  
  /** Modal type to open (for openModal) (optional) */
  modalType?: string;
  
  /** Plugin event name (for pluginEvent) (optional) */
  pluginEvent?: string;
  
  /** Additional action data (optional) */
  data?: Record<string, unknown>;
}

/**
 * Panel variant based on conditions
 */
export interface PanelVariant {
  /** Unique variant identifier */
  id: string;
  
  /** Condition for this variant to apply */
  when: JsonLogic;
  
  /** Property overrides for this variant */
  overrides: Partial<Panel>;
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
export interface JsonLogicExpression {
  [operator: string]: unknown;
}

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
