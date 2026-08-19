/*
 * Public API Surface of player
 */

// Type definitions
export * from './lib/types';

// Services (export only the service classes, not re-exporting types)
export { PlayerStateService } from './lib/services/player-state.service';
export { ManifestService } from './lib/services/manifest.service';
export { VariableStoreService } from './lib/services/variable-store.service';
export { FlowEngineService } from './lib/services/flow-engine.service';
export { ImageCacheService } from './lib/services/image-cache.service';
export { AudioEngineService, type AudioTrack, type PlaybackState } from './lib/services/audio-engine.service';
export { VideoControllerService, type VideoState, type VideoEvent, type VideoStatus } from './lib/services/video-controller.service';
export { UserGestureService } from './lib/services/user-gesture.service';
export { VisibilityService, VISIBILITY_THRESHOLD, type VisibilityChange } from './lib/services/visibility.service';
export {
  VideoSequencerService,
  DEFAULT_STALL_TIMEOUT_MS,
  type SequencedVideo,
  type SequencedVideoInfo,
} from './lib/services/video-sequencer.service';
export { PreloadService, type PreloadItem, type PreloadPriority } from './lib/services/preload.service';
export { TrackingService, type TrackingEvent } from './lib/services/tracking.service';
export { EntitlementService } from './lib/services/entitlement.service';
export { PluginHostService } from './lib/services/plugin-host.service';
export { VariantService } from './lib/services/variant.service';
export { ExportService } from './lib/services/export.service';
export { TranslationService } from './lib/services/translation.service';

// Legacy
export * from './lib/player.service';

// Utilities
export {
  DEFAULT_BALLOON_CONFIG,
  mergeBalloonConfig,
  balloonConfigToRenderOptions,
  balloonConfigToTailOptions,
  ComicBalloon,
  createBalloon,
  type BalloonOptions,
  type TailOptions,
  type BalloonRenderResult,
  DEFAULT_VIDEO_PLAY_MODE,
  DEFAULT_VIDEO_START_MODE,
  DEFAULT_VIDEO_MUTED,
  resolvePlayMode,
  resolveStartMode,
  resolveMuted,
  resolveVideoConfig,
  type EffectiveVideoConfig,
} from './lib/utils';

// Components
export { PwIconComponent } from './lib/components/icon/pw-icon.component';
export { PlayerShellComponent } from './lib/components/player-shell/player-shell.component';
export {
  CanvasStageComponent,
  CANVAS_PANEL_BUDGET,
  type StagePlacement,
} from './lib/components/canvas-stage/canvas-stage.component';
export {
  CanvasCameraService,
  type CameraState,
} from './lib/services/canvas-camera.service';
export { SpeechBubblesComponent } from './lib/components/overlays/speech-bubbles/speech-bubbles.component';
export { HotspotsOverlayComponent } from './lib/components/overlays/hotspots-overlay/hotspots-overlay.component';
export { PaywallOverlayComponent, type PaywallAction } from './lib/components/overlays/paywall-overlay/paywall-overlay.component';
export { AgeGateComponent, type AgeVerificationResult } from './lib/components/overlays/age-gate/age-gate.component';
export { PluginSandboxComponent } from './lib/components/plugin-sandbox/plugin-sandbox.component';
export { VariantSelectorComponent } from './lib/components/variant-selector/variant-selector.component';
export { VideoLayerComponent, type LayerViewMode } from './lib/components/layers/video-layer/video-layer.component';
export * from './lib/player.component';
