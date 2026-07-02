/**
 * Video Controller Service
 * Manages video playback with single active video logic
 */

import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

/**
 * Video state
 */
export type VideoState = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error';

/**
 * Video event
 */
export interface VideoEvent {
  type: 'play' | 'pause' | 'stop' | 'ended' | 'error' | 'buffering' | 'ready';
  videoId: string;
  timestamp: number;
  error?: string;
}

/**
 * Video status
 */
export interface VideoStatus {
  videoId: string;
  state: VideoState;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
}

/**
 * Video Controller Service
 * Ensures only one video plays at a time and manages video lifecycle
 */
/**
 * Registered concurrently-playing video.
 */
interface RegisteredVideo {
  element: HTMLVideoElement;
  muted: boolean;
  /**
   * Invoked when the controller preempts (pauses + unregisters) this video
   * on behalf of a newly-started unmuted video, so the owning component can
   * react (cancel internal timers, update UI state, emit its pause output)
   * instead of finding out only indirectly via the paused element.
   */
  onPreempted?: () => void;
}

@Injectable({
  providedIn: 'root',
})
export class VideoControllerService {
  /**
   * Currently active video element (the most recently started one — retained
   * for backward-compatible status/pause/seek helpers).
   */
  private activeVideo?: HTMLVideoElement;

  /**
   * Active video ID
   */
  private activeVideoId?: string;

  /**
   * Registry of currently-playing videos keyed by videoId. Used to enforce
   * the "at most one unmuted video at a time" rule while allowing any number
   * of muted videos to play concurrently.
   */
  private readonly registry = new Map<string, RegisteredVideo>();

  /**
   * Current state
   */
  private currentState: VideoState = 'idle';

  /**
   * Video event subject
   */
  private eventSubject = new Subject<VideoEvent>();

  /**
   * Video events observable
   */
  readonly events$: Observable<VideoEvent> = this.eventSubject.asObservable();

  /**
   * Emits the videoId whenever a video completes one full pass (once → ended;
   * loop / loop-from / pingpong → one cycle). Used by the player shell to
   * drive precise, media-event-based auto-advance for video panels in panel
   * view (§4.5), independent of the concurrency registry.
   */
  private readonly passCompleteSubject = new Subject<string>();
  readonly passComplete$: Observable<string> =
    this.passCompleteSubject.asObservable();

  /** Signal that a video completed one full pass (called by the layer). */
  notifyPassComplete(videoId: string): void {
    this.passCompleteSubject.next(videoId);
  }

  /**
   * Error retry count
   */
  private retryCount = 0;

  /**
   * Max retry attempts
   */
  private readonly MAX_RETRIES = 3;

  /**
   * Retry delay (ms)
   */
  private readonly RETRY_DELAY = 1000;

  /**
   * Play video.
   *
   * Enforces "at most one unmuted video at a time": starting an unmuted video
   * pauses every other currently-playing unmuted video. Muted videos play
   * concurrently without restriction. The most recently started video becomes
   * the "active" one for status/pause/seek helpers.
   *
   * @param videoElement - The video element to play
   * @param videoId - Unique id for this video
   * @param muted - Whether this playback is muted (default false, i.e. unmuted)
   * @param onPreempted - Optional callback invoked if this video is later
   *   paused by the controller to enforce the single-unmuted rule (i.e. some
   *   other video started unmuted). Lets the owning component react (cancel
   *   timers, update UI, emit pause) instead of only observing a paused
   *   element.
   */
  async play(
    videoElement: HTMLVideoElement,
    videoId: string,
    muted = false,
    onPreempted?: () => void
  ): Promise<void> {
    // Enforce the single-unmuted rule: pause other unmuted videos.
    if (!muted) {
      this.pauseOtherUnmuted(videoId);
    }

    try {
      // Register / update this video and set it as the active one.
      this.registry.set(videoId, { element: videoElement, muted, onPreempted });
      this.activeVideo = videoElement;
      this.activeVideoId = videoId;
      this.setState('loading');

      // Attach event listeners
      this.attachEventListeners(videoElement, videoId);

      // Attempt playback
      await videoElement.play();

      this.setState('playing');
      this.retryCount = 0;
      this.emitEvent('play', videoId);
    } catch (error) {
      console.error(`Failed to play video ${videoId}:`, error);
      this.handleError(videoId, error as Error);
      throw error;
    }
  }

  /**
   * Pause all currently-playing unmuted videos except the given one.
   */
  private pauseOtherUnmuted(exceptVideoId: string): void {
    for (const [id, entry] of this.registry) {
      if (id === exceptVideoId || entry.muted) {
        continue;
      }
      entry.element.pause();
      this.registry.delete(id);
      if (this.activeVideoId === id) {
        this.activeVideo = undefined;
        this.activeVideoId = undefined;
      }
      this.emitEvent('pause', id);
      entry.onPreempted?.();
    }
  }

  /**
   * Update the muted state tracked for a registered video (used when an
   * unmute affordance flips a previously muted video to unmuted).
   */
  notifyMutedChanged(videoId: string, muted: boolean): void {
    const entry = this.registry.get(videoId);
    if (entry) {
      entry.muted = muted;
    }
    if (!muted) {
      this.pauseOtherUnmuted(videoId);
    }
  }

  /**
   * Remove a video from the concurrency registry (e.g. when it is paused,
   * ended, or its component is destroyed).
   */
  unregister(videoId: string): void {
    this.registry.delete(videoId);
    if (this.activeVideoId === videoId) {
      this.activeVideo = undefined;
      this.activeVideoId = undefined;
    }
  }

  /**
   * Pause video
   */
  pause(): void {
    if (!this.activeVideo || this.currentState !== 'playing') {
      return;
    }

    this.activeVideo.pause();
    this.setState('paused');
    
    if (this.activeVideoId) {
      this.emitEvent('pause', this.activeVideoId);
    }
  }

  /**
   * Resume video
   */
  async resume(): Promise<void> {
    if (!this.activeVideo || this.currentState !== 'paused') {
      return;
    }

    try {
      await this.activeVideo.play();
      this.setState('playing');
      
      if (this.activeVideoId) {
        this.emitEvent('play', this.activeVideoId);
      }
    } catch (error) {
      console.error('Failed to resume video:', error);
      if (this.activeVideoId) {
        this.handleError(this.activeVideoId, error as Error);
      }
      throw error;
    }
  }

  /**
   * Stop video
   */
  async stop(): Promise<void> {
    if (!this.activeVideo) {
      return;
    }

    const videoId = this.activeVideoId;

    // Pause playback
    this.activeVideo.pause();

    // Reset time
    this.activeVideo.currentTime = 0;

    // Remove event listeners
    this.detachEventListeners(this.activeVideo);

    // Clear references
    if (videoId) {
      this.registry.delete(videoId);
    }
    this.activeVideo = undefined;
    this.activeVideoId = undefined;
    this.setState('idle');
    this.retryCount = 0;

    if (videoId) {
      this.emitEvent('stop', videoId);
    }
  }

  /**
   * Get current video status
   */
  getStatus(): VideoStatus | undefined {
    if (!this.activeVideo || !this.activeVideoId) {
      return undefined;
    }

    return {
      videoId: this.activeVideoId,
      state: this.currentState,
      currentTime: this.activeVideo.currentTime,
      duration: this.activeVideo.duration || 0,
      buffered: this.getBufferedAmount(),
      volume: this.activeVideo.volume,
      muted: this.activeVideo.muted,
    };
  }

  /**
   * Get active video ID
   */
  getActiveVideoId(): string | undefined {
    return this.activeVideoId;
  }

  /**
   * Get current state.
   *
   * NOTE: `currentState` is a single global machine that reflects only the
   * *most recently started* video. With the relaxed "at most one unmuted"
   * rule multiple muted videos can play concurrently, so after one of them
   * fires `ended` (and keeps looping) this can read `idle` while others still
   * play. The `VideoSequencerService` therefore does NOT consult `getState()`
   * for queue decisions — it tracks its own per-slot pass completion via
   * `notifyPassComplete()`. Treat this value as a best-effort hint for the
   * active video only.
   */
  getState(): VideoState {
    return this.currentState;
  }

  /**
   * Check if video is playing
   */
  isPlaying(): boolean {
    return this.currentState === 'playing';
  }

  /**
   * Set volume
   */
  setVolume(volume: number): void {
    if (!this.activeVideo) {
      return;
    }

    this.activeVideo.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set muted state
   */
  setMuted(muted: boolean): void {
    if (!this.activeVideo) {
      return;
    }

    this.activeVideo.muted = muted;
  }

  /**
   * Seek to time
   */
  seek(time: number): void {
    if (!this.activeVideo) {
      return;
    }

    this.activeVideo.currentTime = Math.max(0, Math.min(time, this.activeVideo.duration || 0));
  }

  /**
   * Attach event listeners to video element
   */
  private attachEventListeners(video: HTMLVideoElement, videoId: string): void {
    video.addEventListener('ended', () => this.onEnded(videoId));
    video.addEventListener('error', () => this.onError(videoId));
    video.addEventListener('waiting', () => this.onWaiting(videoId));
    video.addEventListener('canplay', () => this.onCanPlay(videoId));
    video.addEventListener('playing', () => this.onPlaying(videoId));
  }

  /**
   * Detach event listeners from video element
   */
  private detachEventListeners(video: HTMLVideoElement): void {
    // Clone and replace to remove all listeners
    const clone = video.cloneNode(true) as HTMLVideoElement;
    video.parentNode?.replaceChild(clone, video);
  }

  /**
   * Handle video ended.
   *
   * Deliberately does NOT touch the concurrency registry: a native `ended`
   * event also fires at the internal cycle boundary of a looping/pingpong
   * video (it keeps playing right after), so unregistering here would drop
   * the "at most one unmuted video" enforcement and the `onPreempted`
   * callback for any video that continues past its first cycle. The owning
   * component knows the play mode and is responsible for calling
   * `unregister()` when playback is genuinely finished (or on pause/stop/
   * destroy) — see `VideoLayerComponent.handleEnded()`.
   */
  private onEnded(videoId: string): void {
    this.setState('idle');
    this.emitEvent('ended', videoId);
  }

  /**
   * Handle video error
   */
  private onError(videoId: string): void {
    if (!this.activeVideo) {
      return;
    }

    const error = this.activeVideo.error;
    const errorMessage = error ? this.getErrorMessage(error) : 'Unknown error';
    
    this.handleError(videoId, new Error(errorMessage));
  }

  /**
   * Handle waiting (buffering)
   */
  private onWaiting(videoId: string): void {
    this.setState('buffering');
    this.emitEvent('buffering', videoId);
  }

  /**
   * Handle can play
   */
  private onCanPlay(videoId: string): void {
    if (this.currentState === 'buffering' || this.currentState === 'loading') {
      this.setState('paused');
      this.emitEvent('ready', videoId);
    }
  }

  /**
   * Handle playing
   */
  private onPlaying(videoId: string): void {
    if (this.currentState !== 'playing') {
      this.setState('playing');
    }
  }

  /**
   * Handle error with retry logic
   */
  private handleError(videoId: string, error: Error): void {
    console.error(`Video error for ${videoId}:`, error);

    if (this.retryCount < this.MAX_RETRIES) {
      this.retryCount++;
      console.log(`Retrying video ${videoId} (attempt ${this.retryCount}/${this.MAX_RETRIES})`);

      setTimeout(() => {
        if (this.activeVideo && this.activeVideoId === videoId) {
          this.activeVideo.load();
          this.activeVideo.play().catch((err) => {
            console.error('Retry failed:', err);
            this.setState('error');
            this.emitEvent('error', videoId, error.message);
          });
        }
      }, this.RETRY_DELAY * this.retryCount);
    } else {
      this.setState('error');
      this.emitEvent('error', videoId, error.message);
    }
  }

  /**
   * Get error message from MediaError
   */
  private getErrorMessage(error: MediaError): string {
    switch (error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        return 'Video playback aborted';
      case MediaError.MEDIA_ERR_NETWORK:
        return 'Network error while loading video';
      case MediaError.MEDIA_ERR_DECODE:
        return 'Video decoding failed';
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        return 'Video format not supported';
      default:
        return 'Unknown video error';
    }
  }

  /**
   * Get buffered amount (percentage)
   */
  private getBufferedAmount(): number {
    if (!this.activeVideo || !this.activeVideo.buffered.length) {
      return 0;
    }

    const duration = this.activeVideo.duration;
    if (!duration || duration === 0) {
      return 0;
    }

    // Get end of last buffered range
    const bufferedEnd = this.activeVideo.buffered.end(this.activeVideo.buffered.length - 1);
    return (bufferedEnd / duration) * 100;
  }

  /**
   * Set current state
   */
  private setState(state: VideoState): void {
    this.currentState = state;
  }

  /**
   * Emit video event
   */
  private emitEvent(type: VideoEvent['type'], videoId: string, error?: string): void {
    this.eventSubject.next({
      type,
      videoId,
      timestamp: Date.now(),
      error,
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.registry.clear();
    this.eventSubject.complete();
    this.passCompleteSubject.complete();
  }
}
