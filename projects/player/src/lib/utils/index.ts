/**
 * Utility Functions
 * Central export for all utility modules
 * @packageDocumentation
 */

// Locale utilities
export {
  resolveLocalizedString,
  getBaseLanguage,
  pickLocalizedAsset,
  isLocaleSupported,
  getLocalizationCompleteness,
  createLocaleFallbackChain,
  normalizeLocaleCode,
} from './locale-utils';

// Video config utilities
export {
  DEFAULT_VIDEO_PLAY_MODE,
  DEFAULT_VIDEO_START_MODE,
  DEFAULT_VIDEO_MUTED,
  resolvePlayMode,
  resolveStartMode,
  resolveMuted,
  resolveVideoConfig,
  type EffectiveVideoConfig,
} from './video-config-utils';

// Asset utilities
export {
  resolveAssetUrl,
  pickAssetBase,
  resolveManifestAssetUrl,
  isAbsoluteUrl,
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

// JSON Logic utilities
export {
  evaluateJsonLogic,
  createContext,
  validateJsonLogic,
  extractVariableNames,
  addCustomOperator,
  removeCustomOperator,
  registerPanelWaveOperators,
  evaluateAll,
  evaluateAny,
  testJsonLogic,
} from './json-logic-utils';

// Balloon config utilities
export {
  DEFAULT_BALLOON_CONFIG,
  mergeBalloonConfig,
  balloonConfigToRenderOptions,
  balloonConfigToTailOptions,
} from './balloon-config';

// Comic Balloon renderer
export {
  ComicBalloon,
  createBalloon,
  type BalloonOptions,
  type BalloonPadding,
  type TailOptions,
  type CutOptions,
  type BalloonRenderResult,
} from './comic-balloon';

// Animation utilities
export {
  type EasingFunction,
  getEasingFunction,
  shouldReduceMotion,
  getAdjustedDuration,
  clamp,
  lerp,
  mapRange,
  requestFrame,
  cancelFrame,
  animate,
  easings,
} from './animation-utils';

export {
  selectImageVariantForWidth,
  quantizeTargetWidth,
} from './image-variant-utils';

// Panel variant utilities (manifest PanelVariant runtime)
export {
  selectVariant,
  applyVariantOverrides,
  resolvePanelVariant,
  resolvePanels,
  type ResolvedPanel,
  type VariantContext,
} from './variant-utils';

// Focus-rect placement for panel view (Panel.formatViews[...].minimalFocusRect)
export {
  OUTPUT_FORMAT_ASPECT,
  NO_FOCUS_TRANSFORM,
  pickFocusRect,
  focusTransform,
  type PanelFocusTransform,
} from './focus-rect-utils';

// Layer keyframe animations (schema PanelAnimations.keyframes, 1.6+)
export {
  KEYFRAME_BLUR_REFERENCE_WIDTH,
  hasKeyframes,
  buildKeyframeTracks,
  keyframeAnimationDuration,
  sampleTrack,
  sampleKeyframes,
  animationTime,
  layerAnimationStyles,
  type LayerAnimationState,
  type LayerAnimationStyles,
  type KeyframeTracks,
} from './keyframe-animation';

// Panel camera moves (schema PanelAnimations.startViewportRect / endViewportRect)
export {
  FULL_VIEWPORT_RECT,
  NO_CAMERA_TRANSFORM,
  normalizeViewportRect,
  cameraMoveRects,
  hasCameraMove,
  sampleViewportRect,
  viewportRectTransform,
  cameraTransformCss,
  panelAnimationPlayTime,
  type CameraTransform,
} from './camera-move';

// Page view format selection (one page sequence per output format)
export {
  screenClassFor,
  pageFormatOf,
  pageFormatsOf,
  rankPageFormats,
  pickPageFormat,
  pagesForFormat,
  pageAspectRatio,
  type ScreenClass,
} from './page-format-utils';

// Reading position as a URL (?page= / ?panel=)
export {
  LOCATION_PARAMS,
  parseLocationSearch,
  locationUrl,
  type PlayerLocation,
  type PlayerView,
} from './player-location';

// Page background color (page view gutters, panel view frame)
export { DEFAULT_PAGE_BACKGROUND, resolvePageBackground } from './page-background';

// Navigation thumbnails and the work's cover
export { THUMBNAIL_WIDTH, panelThumbnailSrc, coverImageSrc } from './thumbnail-utils';
