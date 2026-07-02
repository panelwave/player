/**
 * Video Layer Component
 * Renders a video layer and implements the PanelWave playback core:
 * play modes (once / loop / pingpong / loop-from), start modes
 * (on-view / on-hover / on-click), the browser autoplay policy (start muted
 * until a user gesture, with an unmute affordance) and reduced-motion
 * degradation.
 *
 * The component exposes a small programmatic surface (`viewActive` input plus
 * `play()`/`pause()`/`stop()` methods and a `passComplete` output) so a future
 * page-view sequencer can drive it without knowing the playback internals.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
} from '@angular/core';
import type {
  VideoPlayMode,
  VideoStartMode,
} from '../../../types';
import { VideoControllerService } from '../../../services/video-controller.service';
import { UserGestureService } from '../../../services/user-gesture.service';
import { shouldReduceMotion } from '../../../utils/animation-utils';

/** View mode the layer is rendered in. */
export type LayerViewMode = 'panel' | 'page';

let nextVideoInstanceId = 0;

/**
 * Video Layer Component
 */
@Component({
  selector: 'pw-video-layer',
  imports: [],
  templateUrl: './video-layer.component.html',
  styleUrls: ['./video-layer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoLayerComponent implements OnChanges, OnDestroy {
  private readonly controller = inject(VideoControllerService);
  private readonly gesture = inject(UserGestureService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Video source URL (forward variant). */
  @Input() src = '';

  /** Reverse-variant URL used for the pingpong backward pass (empty if none). */
  @Input() reverseSrc = '';

  /** Base URL for resolving relative paths. */
  @Input() baseUrl = '';

  /** Poster image URL. */
  @Input() poster = '';

  /** Show native controls. */
  @Input() controls = true;

  /** Effective playback mode. */
  @Input() playMode: VideoPlayMode = 'once';

  /** Effective start trigger. */
  @Input() startMode: VideoStartMode = 'on-view';

  /** Effective muted state as authored (may be overridden by autoplay policy). */
  @Input() muted = true;

  /** Media-timeline start offset in milliseconds. */
  @Input() startAtMs = 0;

  /** Loop re-entry point in ms (only for playMode 'loop-from'). */
  @Input() loopFromMs?: number;

  /** Active source is a streaming/HLS variant (disables seamless pingpong). */
  @Input() streaming = false;

  /** View mode (`on-hover` only applies in page view). */
  @Input() viewMode: LayerViewMode = 'panel';

  /**
   * Sequencer surface: whether this panel is currently visible / current.
   * `on-view` videos play when this becomes true and pause+reset when false.
   */
  @Input() viewActive = false;

  /** Reduced-motion preference (falls back to media query when not provided). */
  @Input() reducedMotion?: boolean;

  /** Accessible label (from asset alt/caption where available). */
  @Input() ariaLabel = '';

  /** Unique id for controller registration; auto-generated when absent. */
  @Input() videoId = `pw-video-${nextVideoInstanceId++}`;

  /** Video started playing. */
  @Output() videoPlay = new EventEmitter<void>();

  /** Video paused. */
  @Output() videoPause = new EventEmitter<void>();

  /** Video reached the end of a forward pass (native `ended`). */
  @Output() videoEnd = new EventEmitter<void>();

  /** A loop / pingpong iteration restarted. */
  @Output() videoLoop = new EventEmitter<void>();

  /**
   * One full pass completed (once → ended; loop/loop-from/pingpong → one full
   * cycle). Intended for a future sequencer to advance its queue.
   */
  @Output() passComplete = new EventEmitter<void>();

  /** Video failed to load. */
  @Output() videoError = new EventEmitter<ErrorEvent>();

  /** Reference to the video element. */
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;

  /** Whether an unmute affordance should be shown (autoplay-policy override). */
  showUnmuteButton = false;

  /** Muted state reflected onto the <video> element (see setElementMuted). */
  displayMuted = true;

  /** Whether pingpong is currently in its backward phase. */
  private reversePhase = false;

  /** Whether a reversed variant is being used for the backward pass. */
  private usingReverseVariant = false;

  /** requestVideoFrameCallback / raf handle for frame-stepping fallback. */
  private frameStepHandle: number | null = null;

  /** Whether pingpong degraded to loop (streaming, no reverse variant). */
  private pingpongDegraded = false;

  /**
   * True while a `video.src` swap (reverse ↔ forward variant, seamless
   * pingpong) is in flight. Guards `onLoadedMetadata` so the initial-setup
   * path (attach listeners, seek to start, maybe autoplay) does not re-run
   * when the swap's own `loadedmetadata` fires — that event is instead
   * consumed by a dedicated one-time listener that performs the post-swap
   * seek/play once the new source's metadata is actually ready.
   */
  private swapInProgress = false;

  /** Whether we already warned about pingpong degradation (warn once). */
  private static pingpongWarned = false;

  /** Bound media-event handlers (so they can be detached). */
  private readonly onEndedBound = (): void => this.handleEnded();
  private readonly onPlayBound = (): void => this.videoPlay.emit();
  private readonly onPauseBound = (): void => this.videoPause.emit();

  // ---------------------------------------------------------------------------
  // URL resolution
  // ---------------------------------------------------------------------------

  getVideoUrl(): string {
    return this.resolveUrl(this.src);
  }

  getPosterUrl(): string {
    return this.resolveUrl(this.poster);
  }

  private resolveUrl(value: string): string {
    if (!value) return '';
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    return this.baseUrl + value;
  }

  private get video(): HTMLVideoElement | undefined {
    return this.videoElement?.nativeElement;
  }

  private get startTimeSec(): number {
    return Math.max(0, this.startAtMs) / 1000;
  }

  private get loopFromSec(): number | undefined {
    return this.loopFromMs !== undefined ? this.loopFromMs / 1000 : undefined;
  }

  private isReducedMotion(): boolean {
    return this.reducedMotion ?? shouldReduceMotion();
  }

  /**
   * The effective start mode after context degradation:
   * - reduced motion degrades `on-view` to `on-click`.
   * - `on-hover` degrades to `on-click` outside page view or on touch devices.
   */
  effectiveStartMode(): VideoStartMode {
    if (this.startMode === 'on-view' && this.isReducedMotion()) {
      return 'on-click';
    }
    if (this.startMode === 'on-hover' && (this.viewMode !== 'page' || this.isTouchDevice())) {
      return 'on-click';
    }
    return this.startMode;
  }

  private isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    );
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnChanges(changes: SimpleChanges): void {
    // React to viewActive changes for on-view start mode.
    if (changes['viewActive'] && !changes['viewActive'].firstChange) {
      this.handleViewActiveChange();
    }
  }

  ngOnDestroy(): void {
    this.stopFrameStepping();
    this.detachMediaListeners();
    this.controller.unregister(this.videoId);
  }

  /** Native video error handler. */
  onError(event: Event): void {
    this.videoError.emit(event as ErrorEvent);
  }

  /** Called from the template once the <video> element is available. */
  onLoadedMetadata(): void {
    // A pingpong src swap (reverse <-> forward variant) also fires
    // `loadedmetadata`; that occurrence is handled by a dedicated one-time
    // listener registered by the swap itself, so the initial-setup path
    // below must not re-run (it would re-attach listeners and could
    // re-trigger autoplay).
    if (this.swapInProgress) {
      return;
    }
    this.attachMediaListeners();
    this.seekToStart();
    // If on-view and already active at init, kick off playback.
    if (this.effectiveStartMode() === 'on-view' && this.viewActive) {
      void this.play();
    }
  }

  // ---------------------------------------------------------------------------
  // Start-mode triggers (template-facing)
  // ---------------------------------------------------------------------------

  private handleViewActiveChange(): void {
    if (this.effectiveStartMode() !== 'on-view') {
      // hover/click videos keep their position when visibility is lost.
      if (!this.viewActive) {
        this.pause();
      }
      return;
    }
    if (this.viewActive) {
      void this.play();
    } else {
      // on-view: pause and reset so re-entry replays from the start.
      this.stop();
    }
  }

  /** Click / tap handler (on-click toggle). */
  onClick(): void {
    if (this.effectiveStartMode() !== 'on-click') {
      return;
    }
    this.togglePlayback();
  }

  /** Keyboard handler (Enter / Space) for on-click layers. */
  onKeydown(event: KeyboardEvent): void {
    if (this.effectiveStartMode() !== 'on-click') {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.togglePlayback();
    }
  }

  /** Mouse enter — on-hover start (page view only). */
  onMouseEnter(): void {
    if (this.effectiveStartMode() !== 'on-hover') {
      return;
    }
    void this.play();
  }

  /** Mouse leave — on-hover pause keeping position. */
  onMouseLeave(): void {
    if (this.effectiveStartMode() !== 'on-hover') {
      return;
    }
    this.pause();
  }

  private togglePlayback(): void {
    const video = this.video;
    if (video && !video.paused) {
      this.pause();
    } else {
      void this.play();
    }
  }

  /** Whether this layer participates in keyboard interaction. */
  isKeyboardInteractive(): boolean {
    return this.effectiveStartMode() === 'on-click';
  }

  // ---------------------------------------------------------------------------
  // Playback core
  // ---------------------------------------------------------------------------

  /**
   * Start (or resume) playback, applying play mode and the autoplay policy.
   */
  async play(): Promise<void> {
    const video = this.video;
    if (!video) return;

    this.resolvePingpongStrategy();

    // Apply autoplay policy: non-gesture playback must start muted.
    const effectiveMuted = this.computeEffectiveMuted();
    this.setElementMuted(effectiveMuted);
    this.showUnmuteButton = this.wantsSound() && effectiveMuted;

    // Ensure we start from the configured offset when at the beginning.
    if (video.currentTime < this.startTimeSec || video.ended) {
      this.seekToStart();
    }

    try {
      await this.controller.play(video, this.videoId, effectiveMuted, () =>
        this.handlePreempted()
      );
      this.cdr.markForCheck();
    } catch {
      // Controller already logs/handles retries.
    }
  }

  /**
   * Invoked by the controller when it pauses this video to enforce the
   * single-unmuted-video rule (some other layer started unmuted). The
   * element itself is already paused by the controller at this point;
   * this brings the component's own state in line: stop any pingpong
   * frame-stepping timer (it would otherwise keep ticking against a paused
   * element) and drop the unmute affordance. The native `pause` media event
   * (fired by the element itself when `.pause()` is called) drives the
   * `videoPause` output via the existing `onPauseBound` listener, so it is
   * not re-emitted here.
   */
  private handlePreempted(): void {
    this.stopFrameStepping();
    this.showUnmuteButton = false;
    this.cdr.markForCheck();
  }

  /** Pause keeping the current position. */
  pause(): void {
    this.stopFrameStepping();
    const video = this.video;
    if (video) {
      video.pause();
    }
    this.controller.unregister(this.videoId);
    this.showUnmuteButton = false;
    this.cdr.markForCheck();
  }

  /** Pause and reset to the configured start offset. */
  stop(): void {
    this.stopFrameStepping();
    this.reversePhase = false;
    const video = this.video;
    if (video) {
      video.pause();
      this.seekToStart();
    }
    this.controller.unregister(this.videoId);
    this.showUnmuteButton = false;
    this.cdr.markForCheck();
  }

  /** Unmute affordance clicked: count the gesture and unmute. */
  onUnmuteClick(event: Event): void {
    event.stopPropagation();
    this.gesture.markInteracted();
    const video = this.video;
    if (video) {
      this.setElementMuted(false);
      this.controller.notifyMutedChanged(this.videoId, false);
    }
    this.showUnmuteButton = false;
    this.cdr.markForCheck();
  }

  private wantsSound(): boolean {
    // pingpong is always silent; only non-muted authored config wants sound.
    return !this.muted && this.playMode !== 'pingpong';
  }

  private computeEffectiveMuted(): boolean {
    // Pingpong: muted during the reverse phase regardless of setting.
    if (this.playMode === 'pingpong' && !this.pingpongDegraded) {
      return this.muted || this.reversePhase;
    }
    if (this.muted) {
      return true;
    }
    // Wants sound but no gesture yet → forced muted (with affordance).
    return !this.gesture.hasInteracted();
  }

  private setElementMuted(muted: boolean): void {
    this.displayMuted = muted;
    const video = this.video;
    if (video) {
      video.muted = muted;
    }
  }

  private seekToStart(): void {
    const video = this.video;
    if (video && Number.isFinite(this.startTimeSec)) {
      try {
        video.currentTime = this.startTimeSec;
      } catch {
        // currentTime may throw before metadata is ready; ignored.
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Media event handling (play-mode engine)
  // ---------------------------------------------------------------------------

  private attachMediaListeners(): void {
    const video = this.video;
    if (!video) return;
    video.addEventListener('ended', this.onEndedBound);
    video.addEventListener('play', this.onPlayBound);
    video.addEventListener('pause', this.onPauseBound);
  }

  private detachMediaListeners(): void {
    const video = this.video;
    if (!video) return;
    video.removeEventListener('ended', this.onEndedBound);
    video.removeEventListener('play', this.onPlayBound);
    video.removeEventListener('pause', this.onPauseBound);
  }

  private handleEnded(): void {
    const mode = this.pingpongDegraded ? 'loop' : this.playMode;

    // `videoEnd` means "the video is finished" (once mode). Loop /
    // loop-from / pingpong all restart internally on the native `ended`
    // event, so it must not fire at those internal boundaries.
    if (mode === 'once') {
      this.videoEnd.emit();
    }

    switch (mode) {
      case 'once':
        // Freeze on last frame — do not rewind.
        this.controller.unregister(this.videoId);
        this.passComplete.emit();
        break;
      case 'loop':
        this.seekToStart();
        this.videoLoop.emit();
        this.passComplete.emit();
        void this.video?.play();
        break;
      case 'loop-from':
        this.seekToLoopFrom();
        this.videoLoop.emit();
        this.passComplete.emit();
        void this.video?.play();
        break;
      case 'pingpong':
        // Forward pass ended; the reverse pass begins now and completes
        // the cycle. `videoLoop`/`passComplete` for this cycle are emitted
        // once, from `finishReversePass`, when the cycle actually completes.
        this.startReversePass();
        break;
      default:
        break;
    }
  }

  private seekToLoopFrom(): void {
    const video = this.video;
    if (!video) return;
    const loopFrom = this.loopFromSec;
    const duration = video.duration || 0;
    // Clamp invalid loopFrom (>= duration or < startAt) to startAt.
    if (
      loopFrom === undefined ||
      !Number.isFinite(loopFrom) ||
      loopFrom < this.startTimeSec ||
      (duration > 0 && loopFrom >= duration)
    ) {
      this.seekToStart();
      return;
    }
    try {
      video.currentTime = loopFrom;
    } catch {
      this.seekToStart();
    }
  }

  // ---------------------------------------------------------------------------
  // Ping-pong engine
  // ---------------------------------------------------------------------------

  private resolvePingpongStrategy(): void {
    if (this.playMode !== 'pingpong') {
      this.pingpongDegraded = false;
      return;
    }
    // Streaming assets cannot frame-step or swap seamlessly → degrade to loop.
    if (this.streaming) {
      this.pingpongDegraded = true;
      this.warnPingpongDegraded('streaming/HLS video');
      return;
    }
    this.pingpongDegraded = false;
    this.usingReverseVariant = !!this.reverseSrc;
  }

  private warnPingpongDegraded(reason: string): void {
    if (!VideoLayerComponent.pingpongWarned) {
      VideoLayerComponent.pingpongWarned = true;
      console.warn(
        `[pw-video-layer] pingpong not supported for ${reason}; falling back to loop.`
      );
    }
  }

  /** Begin the backward pass of a pingpong cycle. */
  private startReversePass(): void {
    const video = this.video;
    if (!video) return;
    this.reversePhase = true;

    if (this.usingReverseVariant && this.reverseSrc) {
      // Seamless swap: play the pre-rendered reverse encode (muted). The
      // new source's metadata (and therefore a meaningful `currentTime`)
      // is not available synchronously after assigning `src` — seeking/
      // playing must wait for `loadedmetadata` on some browsers, so defer
      // via a dedicated one-time listener rather than the template's
      // persistent `onLoadedMetadata` (guarded off via swapInProgress).
      this.setElementMuted(true);
      this.swapInProgress = true;
      video.addEventListener(
        'loadedmetadata',
        () => {
          this.swapInProgress = false;
          const v = this.video;
          if (!v) return;
          try {
            v.currentTime = 0;
          } catch {
            // currentTime may throw if metadata still isn't ready; ignored.
          }
          void v.play();
        },
        { once: true }
      );
      video.src = this.resolveUrl(this.reverseSrc);
      video.addEventListener('ended', this.onReverseVariantEndedBound, { once: true });
      return;
    }

    // Fallback: frame-step currentTime backward toward startAtMs.
    this.setElementMuted(true);
    video.pause();
    this.startFrameStepping();
  }

  private readonly onReverseVariantEndedBound = (): void =>
    this.finishReversePass();

  /**
   * Complete the backward pass: swap back to the forward variant (if a
   * seamless reverse variant was used) and start the next forward pass.
   * This marks the completion of one full pingpong cycle, so the cycle's
   * single `videoLoop`/`passComplete` emissions happen here.
   */
  private finishReversePass(): void {
    this.reversePhase = false;
    const video = this.video;
    if (!video) return;

    if (this.usingReverseVariant && this.reverseSrc) {
      // Swap back to the forward variant. Same metadata-timing hazard as
      // the reverse swap: defer the seek/play until the new source's
      // `loadedmetadata`, guarding the template's initial-setup handler.
      this.swapInProgress = true;
      video.addEventListener(
        'loadedmetadata',
        () => {
          this.swapInProgress = false;
          const v = this.video;
          if (!v) return;
          this.setElementMuted(this.computeEffectiveMuted());
          this.seekToStart();
          void v.play();
        },
        { once: true }
      );
      video.src = this.getVideoUrl();
    } else {
      // Frame-stepping fallback: already on the forward source, already at
      // the start offset (set by startFrameStepping's tick loop).
      this.setElementMuted(this.computeEffectiveMuted());
      void video.play();
    }

    this.videoLoop.emit();
    this.passComplete.emit();
  }

  private startFrameStepping(): void {
    const video = this.video;
    if (!video) return;
    const step = 1 / 30; // ~30fps backward stepping
    const tick = (): void => {
      if (!this.reversePhase || !this.video) {
        return;
      }
      const next = this.video.currentTime - step;
      if (next <= this.startTimeSec) {
        this.video.currentTime = this.startTimeSec;
        this.finishReversePass();
        return;
      }
      this.video.currentTime = next;
      this.scheduleFrameStep(tick);
    };
    this.scheduleFrameStep(tick);
  }

  private scheduleFrameStep(cb: () => void): void {
    const video = this.video as (HTMLVideoElement & {
      requestVideoFrameCallback?: (fn: () => void) => number;
    }) | undefined;
    if (video?.requestVideoFrameCallback) {
      this.frameStepHandle = video.requestVideoFrameCallback(() => cb());
    } else if (typeof requestAnimationFrame !== 'undefined') {
      this.frameStepHandle = requestAnimationFrame(() => cb());
    } else {
      this.frameStepHandle = setTimeout(cb, 33) as unknown as number;
    }
  }

  private stopFrameStepping(): void {
    if (this.frameStepHandle === null) return;
    const video = this.video as (HTMLVideoElement & {
      cancelVideoFrameCallback?: (h: number) => void;
    }) | undefined;
    if (video?.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(this.frameStepHandle);
    } else if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.frameStepHandle);
    } else {
      clearTimeout(this.frameStepHandle);
    }
    this.frameStepHandle = null;
  }
}
