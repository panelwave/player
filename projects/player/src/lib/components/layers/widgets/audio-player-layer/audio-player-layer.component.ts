/**
 * Audio player layer (schema 1.10+ `kind: "audioPlayer"`): a visible player
 * for listening on demand — play/pause, the catalog item's waveform peaks
 * (or a progress bar), position / duration, and seeking by clicking or
 * dragging in the waveform (keyboard: ←/→ 5 s, PageUp/PageDown 30 s,
 * Home/End).
 *
 * It never autoplays and is not panel background audio (`kind: "audio"` is):
 * it plays through its own `<audio>` element (no Web Audio routing, so no
 * CORS requirement on the file), pauses when the reader leaves the panel —
 * unless `keepPlaying`: then it plays on while the reader reads ahead, its
 * element handed to WidgetPlaybackService when the widget unmounts and taken
 * back when it mounts again —, plays one-at-a-time with the other widgets,
 * follows the reader's master mute and — `duckMusic`, default on — lowers
 * music and ambient while it plays.
 *
 * The `<audio>` element is created in code (not in the template) so it can
 * outlive the widget.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import type { AssetCatalogItemAudio, AudioPlayerLayer, AudioVariant } from '../../../../types';
import { ManifestService } from '../../../../services/manifest.service';
import { AssetUrlService } from '../../../../services/asset-url.service';
import { AudioEngineService } from '../../../../services/audio-engine.service';
import { WidgetPlaybackService, type WidgetPlaybackHandle } from '../../../../services/widget-playback.service';
import { ThemeService } from '../../../../services/theme.service';
import { formatMediaTime, isPrintRender } from '../../../../utils/widget-utils';
import { PwIconComponent } from '../../../icon/pw-icon.component';
import { localized, ratioFromPointer, widgetInstanceId, widgetRootStyles, widgetText } from '../widget-shared';

/** Music / ambient level while an audio player plays (duckMusic). */
export const AUDIO_PLAYER_DUCK = 0.2;

/** Resample peaks to `count` bars (max of each bucket). */
export function resamplePeaks(peaks: readonly number[], count: number): number[] {
  if (count <= 0 || peaks.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * peaks.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / count));
    let max = 0;
    for (let j = from; j < to && j < peaks.length; j++) {
      const v = peaks[j];
      if (Number.isFinite(v) && v > max) max = v;
    }
    out.push(Math.min(1, max));
  }
  return out;
}

@Component({
  selector: 'pw-audio-player-layer',
  standalone: true,
  imports: [NgStyle, PwIconComponent],
  templateUrl: './audio-player-layer.component.html',
  styleUrls: ['../widget-card.css', './audio-player-layer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioPlayerLayerComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  private readonly manifest = inject(ManifestService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly engine = inject(AudioEngineService);
  private readonly playback = inject(WidgetPlaybackService, { optional: true });
  private readonly theme = inject(ThemeService, { optional: true });
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  @Input({ required: true }) layer!: AudioPlayerLayer;
  @Input() locale = 'en-US';
  @Input() panelId = '';

  @ViewChild('audioHost') audioHostRef?: ElementRef<HTMLElement>;
  @ViewChild('wave') waveRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('track') trackRef?: ElementRef<HTMLElement>;

  readonly print = isPrintRender();
  playing = false;
  currentTime = 0;
  /** Seconds; from the media once known, else the catalog durationMs. */
  duration = 0;
  waiting = false;
  private seeking = false;
  private ducked = false;
  private startApplied = false;
  private frame = 0;
  private resize?: ResizeObserver;
  private subs = new Subscription();
  private id = '';
  /** The playing element (created here, or taken back from the playback service). */
  private audioEl: HTMLAudioElement | null = null;
  private handle: WidgetPlaybackHandle | null = null;
  private readonly listeners: [string, () => void][] = [
    ['loadedmetadata', () => this.onLoadedMetadata()],
    ['durationchange', () => this.onLoadedMetadata()],
    ['play', () => this.onPlay()],
    ['pause', () => this.onPause()],
    ['ended', () => this.onEnded()],
    ['timeupdate', () => this.onTimeUpdate()],
    ['waiting', () => this.onWaiting(true)],
    ['playing', () => this.onWaiting(false)],
    ['canplay', () => this.onWaiting(false)],
  ];

  ngOnInit(): void {
    this.id = widgetInstanceId(this.panelId, this.layer.id);
    this.duration = (this.asset?.durationMs ?? 0) / 1000;
    this.currentTime = (this.layer.startAtMs ?? 0) / 1000;
    this.handle = { id: this.id, pause: () => this.pause(), keepPlaying: () => this.layer?.keepPlaying === true };
    this.playback?.register(this.handle);
    this.subs.add(
      this.engine.masterMuted$.subscribe((muted) => {
        if (this.audioEl) this.audioEl.muted = muted;
      })
    );
    if (this.theme) {
      this.subs.add(this.theme.theme$.subscribe(() => this.draw()));
    }
  }

  ngOnChanges(): void {
    // A new file (the CMS preview edits the layer): reload, unless it plays on.
    const audio = this.audioEl;
    if (audio && this.src && audio.getAttribute('src') !== this.src && audio.paused) {
      audio.src = this.src;
      this.startApplied = false;
    }
  }

  ngAfterViewInit(): void {
    this.mountAudio();
    const canvas = this.waveRef?.nativeElement;
    if (canvas && typeof ResizeObserver !== 'undefined') {
      this.zone.runOutsideAngular(() => {
        this.resize = new ResizeObserver(() => this.draw());
        this.resize.observe(canvas);
      });
    }
    this.draw();
  }

  ngOnDestroy(): void {
    this.stopFrames();
    this.resize?.disconnect();
    this.subs.unsubscribe();
    const audio = this.audioEl;
    this.audioEl = null;
    if (audio) {
      for (const [type, fn] of this.listeners) audio.removeEventListener(type, fn);
      if (this.playing && !audio.paused && this.layer?.keepPlaying && this.playback) {
        // Plays on while the reader reads ahead; the service keeps it ducked.
        this.playback.park(this.id, { audio, ducked: this.ducked, event: this.eventTemplate() });
        this.ducked = false;
      } else {
        audio.pause();
        audio.remove();
        if (this.playing) this.playback?.notifyStopped(this.id);
      }
    }
    if (this.handle) this.playback?.unregister(this.handle);
    this.unduck();
  }

  /** Create the `<audio>` element — or take back the one that played on while unmounted. */
  private mountAudio(): void {
    const host = this.audioHostRef?.nativeElement;
    if (!host || this.print || !this.src) return;
    const parked = this.playback?.unpark(this.id) ?? null;
    let audio: HTMLAudioElement;
    if (parked && parked.audio.getAttribute('src') === this.src) {
      audio = parked.audio;
      this.ducked = parked.ducked;
      this.startApplied = true;
      if (Number.isFinite(audio.duration) && audio.duration > 0) this.duration = audio.duration;
      this.currentTime = audio.currentTime;
    } else {
      if (parked) {
        parked.audio.pause();
        parked.audio.remove();
      }
      audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = this.src;
    }
    // Moved here within the same task: a playing element does not pause.
    host.appendChild(audio);
    for (const [type, fn] of this.listeners) audio.addEventListener(type, fn);
    audio.muted = this.engine.isMasterMuted();
    this.audioEl = audio;
    if (!audio.paused) {
      this.playing = true;
      this.startFrames();
      this.cdr.markForCheck();
    }
  }

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  get asset(): AssetCatalogItemAudio | null {
    const a = this.manifest.getAsset(this.layer?.assetId ?? '') as AssetCatalogItemAudio | null;
    return a && a.category === 'audio' ? a : null;
  }

  get src(): string {
    const variants = this.asset?.variants ?? [];
    const playable = variants.find((v) => this.canPlay(v)) ?? variants[0];
    return playable ? this.assetUrl.resolve(playable.src, 'audio') : '';
  }

  private canPlay(v: AudioVariant): boolean {
    if (!v.mime || typeof document === 'undefined') return true;
    const probe = document.createElement('audio');
    return !!probe.canPlayType?.(v.mime);
  }

  get peaks(): number[] {
    const w = this.asset?.waveform;
    return Array.isArray(w) ? w : [];
  }

  get showWaveform(): boolean {
    return this.layer?.showWaveform !== false && this.peaks.length > 0;
  }

  get showTime(): boolean {
    return this.layer?.showTime !== false;
  }

  get title(): string {
    return localized(this.layer?.title, this.locale);
  }

  get plain(): boolean {
    return this.layer?.appearance === 'plain';
  }

  get rootStyles(): Record<string, string> {
    return widgetRootStyles(this.layer);
  }

  get progress(): number {
    return this.duration > 0 ? Math.max(0, Math.min(1, this.currentTime / this.duration)) : 0;
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

  get valueText(): string {
    return `${formatMediaTime(this.currentTime)} / ${formatMediaTime(this.duration)}`;
  }

  text(key: string, params?: Record<string, unknown>): string {
    return widgetText(this.translate, key, params);
  }

  get playLabel(): string {
    const base = this.playing ? this.text('pause') : this.text('play');
    return this.title ? `${base}: ${this.title}` : base;
  }

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  toggle(): void {
    if (this.playing) {
      this.pause();
    } else {
      void this.play();
    }
  }

  async play(): Promise<void> {
    const audio = this.audioEl;
    if (!audio || this.print || !this.src) return;
    this.playback?.notifyPlaying(this.id);
    try {
      await audio.play();
    } catch {
      this.playing = false;
      this.playback?.notifyStopped(this.id);
      this.cdr.markForCheck();
    }
  }

  pause(): void {
    const audio = this.audioEl;
    if (audio && !audio.paused) audio.pause();
  }

  onLoadedMetadata(): void {
    const audio = this.audioEl;
    if (!audio) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) this.duration = audio.duration;
    if (!this.startApplied) {
      this.startApplied = true;
      const start = (this.layer.startAtMs ?? 0) / 1000;
      if (start > 0 && start < this.duration) audio.currentTime = start;
    }
    this.draw();
    this.cdr.markForCheck();
  }

  onPlay(): void {
    this.playing = true;
    this.waiting = false;
    this.playback?.notifyPlaying(this.id);
    this.duck();
    this.startFrames();
    this.emit('play');
    this.cdr.markForCheck();
  }

  onPause(): void {
    this.playing = false;
    this.playback?.notifyStopped(this.id);
    this.unduck();
    this.stopFrames();
    this.emit('pause');
    this.cdr.markForCheck();
  }

  onEnded(): void {
    this.playing = false;
    this.playback?.notifyStopped(this.id);
    this.unduck();
    this.stopFrames();
    this.emit('ended');
    this.cdr.markForCheck();
  }

  onTimeUpdate(): void {
    const audio = this.audioEl;
    if (!audio || this.seeking) return;
    this.currentTime = audio.currentTime;
    this.cdr.markForCheck();
  }

  onWaiting(waiting: boolean): void {
    this.waiting = waiting;
    this.cdr.markForCheck();
  }

  private emit(type: 'play' | 'pause' | 'ended'): void {
    this.playback?.emit({ type, ...this.eventTemplate() });
  }

  private eventTemplate() {
    return {
      layerId: this.layer.id,
      kind: 'audioPlayer' as const,
      panelId: this.panelId || undefined,
      assetId: typeof this.layer.assetId === 'string' ? this.layer.assetId : undefined,
    };
  }

  private duck(): void {
    if (this.layer.duckMusic === false || this.ducked) return;
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

  // -------------------------------------------------------------------------
  // Seeking
  // -------------------------------------------------------------------------

  seekTo(seconds: number): void {
    const t = Math.max(0, Math.min(this.duration || 0, seconds));
    this.currentTime = t;
    const audio = this.audioEl;
    if (audio && Number.isFinite(t)) {
      try {
        audio.currentTime = t;
      } catch {
        // Not seekable yet (no metadata): the position applies on play.
      }
    }
    this.draw();
    this.cdr.markForCheck();
  }

  onPointerDown(event: PointerEvent): void {
    if (this.print || !this.trackRef || this.duration <= 0) return;
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

  onSliderKey(event: KeyboardEvent): void {
    const steps: Record<string, number> = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 };
    if (event.key in steps) {
      this.seekTo(this.currentTime + steps[event.key]);
    } else if (event.key === 'Home') {
      this.seekTo(0);
    } else if (event.key === 'End') {
      this.seekTo(this.duration);
    } else if (event.key === ' ' || event.key === 'Enter') {
      this.toggle();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  // -------------------------------------------------------------------------
  // Waveform drawing
  // -------------------------------------------------------------------------

  private startFrames(): void {
    if (this.frame || typeof requestAnimationFrame === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      const tick = () => {
        const audio = this.audioEl;
        if (audio && !this.seeking) this.currentTime = audio.currentTime;
        this.draw();
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  private stopFrames(): void {
    if (this.frame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** Draw the waveform bars (played part in the progress colour). */
  draw(): void {
    const canvas = this.waveRef?.nativeElement;
    if (!canvas || !this.showWaveform) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const style = getComputedStyle(canvas);
    const base = style.getPropertyValue('--pw-theme-waveform').trim() || '#6b7280';
    const played = style.getPropertyValue('--pw-theme-waveform-progress').trim() || '#f59e0b';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const bar = Math.max(2, Math.round(cssW / 90));
    const gap = Math.max(1, Math.round(bar / 2));
    const count = Math.max(1, Math.floor((cssW + gap) / (bar + gap)));
    const bars = resamplePeaks(this.peaks, count);
    const progressX = this.progress * cssW;
    const mid = cssH / 2;
    bars.forEach((peak, i) => {
      const x = i * (bar + gap);
      const h = Math.max(2, peak * cssH);
      ctx.fillStyle = x + bar / 2 <= progressX ? played : base;
      ctx.fillRect(x, mid - h / 2, bar, h);
    });
  }
}
