/**
 * PanelWave Player Type Definitions
 * Central export for all type definitions
 * @packageDocumentation
 */

// Manifest types
export type {
  PanelWaveManifest,
  PanelwaveHeader,
  Meta,
  Creator,
  Character,
  ContentWarning,
  SequenceAudioTrack,
  Chapter,
  Page,
  PageLayout,
  PanelPlacement,
  Settings,
  UIDefaults,
  PreloadSettings,
  OutputPreset,
  Extras,
  ExtraItem,
  ExtraImage,
  Paywall,
  PaywallRule,
  PaywallProduct,
  Tracking,
  UISettings,
  LocalizedString,
  LocaleCode,
  OutputFormat,
  Transition,
  PanelRef,
  AssetRef,
} from './manifest.types';

// Panel types
export type {
  Panel,
  FormatView,
  Layer,
  ImageLayer,
  VideoLayer,
  VideoPlayMode,
  VideoStartMode,
  TextLayer,
  AudioLayer,
  PanelAudioTrack,
  PanelAudioRole,
  PluginLayer,
  LayerKind,
  TextStyle,
  Transform,
  SpeechBubble,
  BoundingBox,
  BubbleTail,
  BubbleStyle,
  BalloonType,
  TailCurve,
  TailConfig,
  HideBorderConfig,
  BalloonConfig,
  BalloonConfigOverride,
  Hotspot,
  HotspotShape,
  HotspotRect,
  HotspotCircle,
  HotspotPolygon,
  HotspotAction,
  HotspotGoToAction,
  HotspotSetVariablesAction,
  HotspotOpenExtrasAction,
  HotspotOpenModalAction,
  HotspotPluginEventAction,
  PanelVariant,
  PanelAnimations,
  AnimationKeyframe,
  AnimatableProperty,
  AnimationEasing,
  PanelPartial,
  PluginInstance,
  NormalizedRect,
  NormalizedPoint,
  JsonLogic,
  JsonLogicExpression,
  Mutation,
} from './panel.types';

// Asset types
export type {
  Assets,
  AssetBase,
  AssetCatalogItem,
  AssetCommon,
  AssetCategory,
  AssetCatalogItemImage,
  ImageVariant,
  AssetCatalogItemAudio,
  AudioRole,
  AudioVariant,
  AssetCatalogItemVideo,
  VideoVariant,
  VideoPoster,
  AssetCatalogItemSubtitle,
  SubtitleVariant,
  AssetCatalogItemVector,
  VectorVariant,
  AssetCatalogItemJson,
  JsonVariant,
  AssetCatalogItemPluginPayload,
  AssetVariant,
  AssetReference,
} from './asset.types';

// Infinite canvas types (schema 1.4)
export type {
  WorldPoint,
  WorldRect,
  CameraMove,
  CameraMovePath,
  CameraZoomProfile,
  CanvasRevealMode,
  CanvasPlacement,
  CanvasDecoration,
  CanvasFitMode,
  CanvasFreeRoam,
  CanvasOverviewPolicy,
  CanvasCameraPolicy,
  CanvasBackground,
  CanvasLayout,
} from './canvas.types';

// Graph types
export type {
  Graph,
  Edge,
  NodeMetadata,
  NavigationPath,
  TraversalOptions,
  TraversalResult,
} from './graph.types';

// Variable types
export type {
  Variables,
  VariableDefinition,
  VariableType,
  VariableScope,
  JsonValue,
  VariableStore,
  VariableMutation,
  MutationOperation,
  VariableChangeEvent,
  VariableValidationResult,
  VariableContext,
  UserVariables,
  PreferenceVariables,
  DeviceVariables,
  EntitlementVariables,
} from './variable.types';

export { RESERVED_NAMESPACES } from './variable.types';

// Player types
export type {
  PlayerOptions,
  DeepLinkTarget,
  PlayerState,
  ViewMode,
  ViewportState,
  PlayerPreferences,
  PaywallGate,
  OverlayState,
  PreloadStatus,
  PlayerError,
  PlayerErrorCode,
  PlayerEventData,
  PanelChangeEvent,
  PlayerPanelChangeEvent,
  DecisionEvent,
  PaywallEvent,
  ErrorEvent,
  TrackingConfig,
  Bookmark,
  ReadingProgress,
  PlayerStatistics,
} from './player.types';

export { PlayerEvent } from './player.types';

export type { VideoTrigger, VideoTrackingPayload } from './player.types';

// Entitlement types
export type {
  EntitlementAdapter,
  EntitlementContext,
  EntitlementStatus,
  UserInfo,
  PreviewInfo,
  PurchaseInfo,
  EntitlementErrorCode,
} from './entitlement.types';

export {
  NullEntitlementAdapter,
  MockEntitlementAdapter,
  EntitlementError,
} from './entitlement.types';
