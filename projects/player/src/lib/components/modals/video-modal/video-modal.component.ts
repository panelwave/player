/**
 * Video modal (schema 1.10+ video player widgets): plays a `videoPlayer`
 * layer's video in a dialog with custom controls — play/pause, a scrub bar
 * with the buffered range, position / duration, mute and fullscreen.
 *
 * Mounted by the shell (`@if`, `[visible]` + `(close)` like every player
 * dialog); the shell's Escape handling closes it. Keyboard inside the dialog:
 * Space / K play-pause, ←/→ 5 s (Shift 30 s), M mute, F fullscreen; Tab stays
 * inside the dialog (focus trap) and focus returns to the trigger on close.
 * The opening click is the user gesture, so `autoplayInModal` starts with
 * sound unless the reader muted the player.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import type { AssetCatalogItemVideo, VideoPlayerLayer, VideoVariant } from '../../../types';
import { ManifestService } from '../../../services/manifest.service';
import { AssetUrlService } from '../../../services/asset-url.service';
import { AudioEngineService } from '../../../services/audio-engine.service';
import { WidgetPlaybackService } from '../../../services/widget-playback.service';
import { VideoControllerService } from '../../../services/video-controller.service';
import { formatMediaTime } from '../../../utils/widget-utils';
import { PwIconComponent } from '../../icon/pw-icon.component';
import { localized, ratioFromPointer, widgetText } from '../../layers/widgets/widget-shared';
import { AUDIO_PLAYER_DUCK } from '../../layers/widgets/audio-player-layer/audio-player-layer.component';

/** Buffering shorter than this shows no spinner. */
const SPINNER_DELAY_MS = 2000;

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"]), video';

@Component({
  selector: 'pw-video-modal',
  standalone: true,
  imports: [PwIconComponent],
  templateUrl: './video-modal.component.html',
  styleUrls: ['./video-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoModalComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly manifest = inject(ManifestService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly engine = inject(AudioEngineService);
  private readonly playback = inject(WidgetPlaybackService, { optional: true });
  private readonly videoController = inject(VideoControllerService, { optional: true });
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() visible = false;
  @Input({ required: true }) layer!: VideoPlayerLayer;
  @Input() panelId = '';
  @Input() locale = 'en-US';
  @Output() close = new EventEmitter<void>();

  @ViewChild('dialog') dialogRef?: ElementRef<HTMLElement>;
  @ViewChild('stage') stageRef?: ElementRef<HTMLElement>;
  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('track') trackRef?: ElementRef<HTMLElement>;
  @ViewChild('playBtn') playBtnRef?: ElementRef<HTMLButtonElement>;

  readonly titleId = `pw-video-modal-title-${Math.random().toString(36).slice(2, 8)}`;
  playing = false;
  muted = false;
  fullscreen = false;
  buffering = false;
  currentTime = 0;
  duration = 0;
  bufferedEnd = 0;
  private seeking = false;
  private ducked = false;
  private spinnerTimer?: ReturnType<typeof setTimeout>;
  private readonly onFullscreenChange = () => {
    this.fullscreen = typeof document !== 'undefined' && !!document.fullscreenElement;
    this.cdr.markForCheck();
  };

  ngOnInit(): void {
    this.muted = this.engine.isMasterMuted();
    this.duration = (this.asset?.durationMs ?? 0) / 1000;
    // Only one thing plays: audio widgets and the panel's own video pause.
    this.playback?.pauseAll();
    this.videoController?.pause();
    this.playback?.setModalOpen(true);
    this.emit('open');
    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', this.onFullscreenChange);
    }
  }

  ngAfterViewInit(): void {
    this.playBtnRef?.nativeElement.focus();
    if (this.layer.autoplayInModal !== false) {
      void this.play();
    }
  }

  ngOnDestroy(): void {
    this.videoRef?.nativeElement.pause();
    clearTimeout(this.spinnerTimer);
    this.unduck();
    this.playback?.setModalOpen(false);
    this.emit('close');
    if (typeof document !== 'undefined') {
      document.removeEventListener('fullscreenchange', this.onFullscreenChange);
      if (document.fullscreenElement && this.stageRef?.nativeElement.contains(document.fullscreenElement)) {
        void document.exitFullscreen?.().catch(() => undefined);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  get asset(): AssetCatalogItemVideo | null {
    const a = this.manifest.getAsset(this.layer?.assetId ?? '') as AssetCatalogItemVideo | null;
    return a && a.category === 'video' ? a : null;
  }

  private get variant(): VideoVariant | undefined {
    const variants = (this.asset?.variants ?? []).filter((v) => v.direction !== 'reverse');
    const probe = typeof document !== 'undefined' ? document.createElement('video') : null;
    return (
      variants.find((v) => v.locale === this.locale && (!v.mime || !!probe?.canPlayType?.(v.mime))) ??
      variants.find((v) => !v.mime || !!probe?.canPlayType?.(v.mime)) ??
      variants[0]
    );
  }

  get src(): string {
    const v = this.variant;
    return v ? this.assetUrl.resolve(v.src, 'video') : '';
  }

  get poster(): string {
    const src = this.asset?.poster?.src;
    return src ? this.assetUrl.resolve(src, 'image') : '';
  }

  /** Width / height of the video for the stage aspect (16:9 fallback). */
  get aspect(): string {
    const v = this.variant;
    return v?.w && v?.h ? `${v.w} / ${v.h}` : '16 / 9';
  }

  get title(): string {
    return localized(this.layer?.title, this.locale) || this.text('video');
  }

  get progress(): number {
    return this.duration > 0 ? Math.min(1, this.currentTime / this.duration) : 0;
  }

  get buffered(): number {
    return this.duration > 0 ? Math.min(1, this.bufferedEnd / this.duration) : 0;
  }

  get timeText(): string {
    return `${formatMediaTime(this.currentTime)} / ${formatMediaTime(this.duration)}`;
  }

  get ariaMax(): number {
    return Math.round(this.duration);
  }

  get ariaNow(): number {
    return Math.round(this.currentTime);
  }

  text(key: string, params?: Record<string, unknown>): string {
    return widgetText(this.translate, key, params);
  }

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  async play(): Promise<void> {
    const video = this.videoRef?.nativeElement;
    if (!video || !this.src) return;
    try {
      await video.play();
    } catch {
      // Autoplay refused (e.g. no gesture in an embed): the reader presses play.
      this.playing = false;
      this.cdr.markForCheck();
    }
  }

  toggle(): void {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    if (video.paused || video.ended) {
      void this.play();
    } else {
      video.pause();
    }
  }

  toggleMute(): void {
    this.muted = !this.muted;
    const video = this.videoRef?.nativeElement;
    if (video) video.muted = this.muted;
  }

  toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    } else {
      void this.stageRef?.nativeElement.requestFullscreen?.().catch(() => undefined);
    }
  }

  get fullscreenAvailable(): boolean {
    return typeof document !== 'undefined' && !!document.fullscreenEnabled;
  }

  onPlay(): void {
    this.playing = true;
    this.duck();
    this.emit('play');
    this.cdr.markForCheck();
  }

  onPause(): void {
    this.playing = false;
    this.unduck();
    this.emit('pause');
    this.cdr.markForCheck();
  }

  onEnded(): void {
    this.playing = false;
    this.unduck();
    this.emit('ended');
    this.cdr.markForCheck();
  }

  onMeta(): void {
    const video = this.videoRef?.nativeElement;
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      this.duration = video.duration;
      this.cdr.markForCheck();
    }
  }

  onTimeUpdate(): void {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    if (!this.seeking) this.currentTime = video.currentTime;
    this.onProgress();
    this.cdr.markForCheck();
  }

  onProgress(): void {
    const video = this.videoRef?.nativeElement;
    const ranges = video?.buffered;
    if (!video || !ranges || ranges.length === 0) return;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= video.currentTime + 0.5) this.bufferedEnd = Math.max(this.bufferedEnd, ranges.end(i));
    }
  }

  onWaiting(): void {
    clearTimeout(this.spinnerTimer);
    this.spinnerTimer = setTimeout(() => {
      this.buffering = true;
      this.cdr.markForCheck();
    }, SPINNER_DELAY_MS);
  }

  onPlaying(): void {
    clearTimeout(this.spinnerTimer);
    if (this.buffering) {
      this.buffering = false;
      this.cdr.markForCheck();
    }
  }

  private duck(): void {
    if (this.ducked) return;
    this.ducked = true;
    this.engine.setRoleDuck('music', AUDIO_PLAYER_DUCK);
    this.engine.setRoleDuck('ambient', AUDIO_PLAYER_DUCK);
  }

  private unduck(): void {
    if (!this.ducked) return;
    this.ducked = false;
    this.engine.setRoleDuck('music', 1);
    this.engine.setRoleDuck('ambient', 1);
  }

  private emit(type: 'open' | 'close' | 'play' | 'pause' | 'ended'): void {
    this.playback?.emit({
      type,
      layerId: this.layer.id,
      kind: 'videoPlayer',
      panelId: this.panelId || undefined,
      assetId: typeof this.layer.assetId === 'string' ? this.layer.assetId : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // Seeking
  // -------------------------------------------------------------------------

  seekTo(seconds: number): void {
    const t = Math.max(0, Math.min(this.duration || 0, seconds));
    this.currentTime = t;
    const video = this.videoRef?.nativeElement;
    if (video) {
      try {
        video.currentTime = t;
      } catch {
        // not seekable yet
      }
    }
    this.cdr.markForCheck();
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.trackRef || this.duration <= 0) return;
    event.preventDefault();
    this.seeking = true;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.seekTo(ratioFromPointer(event, this.trackRef.nativeElement) * this.duration);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.seeking || !this.trackRef) return;
    this.seekTo(ratioFromPointer(event, this.trackRef.nativeElement) * this.duration);
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.seeking) return;
    this.seeking = false;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
  }

  // -------------------------------------------------------------------------
  // Keyboard + dialog
  // -------------------------------------------------------------------------

  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const onButton = target?.tagName === 'BUTTON';
    switch (event.key) {
      case 'Tab':
        this.trapFocus(event);
        return;
      case ' ':
        if (onButton) return;
        this.toggle();
        break;
      case 'k':
      case 'K':
        this.toggle();
        break;
      case 'ArrowLeft':
        this.seekTo(this.currentTime - (event.shiftKey ? 30 : 5));
        break;
      case 'ArrowRight':
        this.seekTo(this.currentTime + (event.shiftKey ? 30 : 5));
        break;
      case 'Home':
        this.seekTo(0);
        break;
      case 'End':
        this.seekTo(this.duration);
        break;
      case 'm':
      case 'M':
        this.toggleMute();
        break;
      case 'f':
      case 'F':
        this.toggleFullscreen();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /** Keep Tab / Shift+Tab inside the dialog. */
  trapFocus(event: KeyboardEvent): void {
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
