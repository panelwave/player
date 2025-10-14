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
export { PreloadService, type PreloadItem, type PreloadPriority } from './lib/services/preload.service';
export { TrackingService, type TrackingEvent } from './lib/services/tracking.service';

// Legacy
export * from './lib/player.service';

// Components
export { PlayerShellComponent } from './lib/components/player-shell/player-shell.component';
export * from './lib/player.component';
