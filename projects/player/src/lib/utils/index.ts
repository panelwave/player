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

// Asset utilities
export {
  resolveAssetUrl,
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
