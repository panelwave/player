/**
 * Video Layer Component
 * Renders video layers with playback controls
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
} from '@angular/core';


/**
 * Video Layer Component
 * Displays videos with playback control
 */
@Component({
    selector: 'pw-video-layer',
    imports: [],
    templateUrl: './video-layer.component.html',
    styleUrls: ['./video-layer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VideoLayerComponent {
  /**
   * Video source URL
   */
  @Input() src = '';

  /**
   * Base URL for resolving relative paths
   */
  @Input() baseUrl = '';

  /**
   * Autoplay video
   */
  @Input() autoplay = false;

  /**
   * Loop video
   */
  @Input() loop = false;

  /**
   * Muted audio
   */
  @Input() muted = false;

  /**
   * Show controls
   */
  @Input() controls = true;

  /**
   * Poster image URL
   */
  @Input() poster = '';

  /**
   * Video started playing
   */
  @Output() videoPlay = new EventEmitter<void>();

  /**
   * Video paused
   */
  @Output() videoPause = new EventEmitter<void>();

  /**
   * Video ended
   */
  @Output() videoEnd = new EventEmitter<void>();

  /**
   * Video failed to load
   */
  @Output() videoError = new EventEmitter<ErrorEvent>();

  /**
   * Reference to video element
   */
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;

  /**
   * Get full video URL
   */
  getVideoUrl(): string {
    if (!this.src) return '';
    
    // If already absolute URL, return as-is
    if (this.src.startsWith('http://') || this.src.startsWith('https://')) {
      return this.src;
    }
    
    // Otherwise prepend base URL
    return this.baseUrl + this.src;
  }

  /**
   * Get full poster URL
   */
  getPosterUrl(): string {
    if (!this.poster) return '';
    
    if (this.poster.startsWith('http://') || this.poster.startsWith('https://')) {
      return this.poster;
    }
    
    return this.baseUrl + this.poster;
  }

  /**
   * Handle video play
   */
  onPlay(): void {
    this.videoPlay.emit();
  }

  /**
   * Handle video pause
   */
  onPause(): void {
    this.videoPause.emit();
  }

  /**
   * Handle video end
   */
  onEnded(): void {
    this.videoEnd.emit();
  }

  /**
   * Handle video error
   */
  onError(event: Event): void {
    this.videoError.emit(event as ErrorEvent);
  }

  /**
   * Play video programmatically
   */
  play(): void {
    this.videoElement?.nativeElement.play();
  }

  /**
   * Pause video programmatically
   */
  pause(): void {
    this.videoElement?.nativeElement.pause();
  }

  /**
   * Stop video (pause and reset to beginning)
   */
  stop(): void {
    const video = this.videoElement?.nativeElement;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }
}
