/**
 * Widget playback coordination (schema 1.10+ content widgets), one per
 * player instance (provided by `PlayerShellComponent`):
 *
 * - only one audio/video widget plays at a time — starting one pauses the
 *   others;
 * - `active$` tells the shell to hold autoplay while a widget plays or the
 *   video modal is open;
 * - `pauseForNavigation()` runs on every panel change: it pauses every
 *   widget except audio players with `keepPlaying`; `pauseAll()` (the video
 *   modal opening) pauses those too;
 * - a `keepPlaying` audio player that unmounts while it plays (its panel
 *   left the screen: panel view, a page turn, a far canvas move) hands its
 *   `<audio>` element over with `park()`: it keeps playing from a hidden
 *   holder, ducked and muted like before, until it ends, another widget
 *   starts or the widget mounts again and takes it back (`unpark()`);
 * - widgets request the video modal through `openVideo()`;
 * - every reader action is published on `events$` (shell output
 *   `widgetEvent` + tracking).
 *
 * Widgets inject it optionally, so they also work outside a shell.
 */
import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, combineLatest, distinctUntilChanged, map } from 'rxjs';
import type { VideoPlayerLayer, WidgetLayerKind } from '../types';
import { AudioEngineService } from './audio-engine.service';

export type WidgetEventType = 'download' | 'play' | 'pause' | 'ended' | 'open' | 'close';

export interface WidgetEvent {
  type: WidgetEventType;
  layerId: string;
  kind: WidgetLayerKind;
  panelId?: string;
  assetId?: string;
}

/** A playing widget the service can pause. */
export interface WidgetPlaybackHandle {
  id: string;
  pause(): void;
  /** Keeps playing when the reader moves to another panel (audio player `keepPlaying`). */
  keepPlaying?(): boolean;
}

/** What the shell needs to show the video modal. */
export interface VideoModalRequest {
  layer: VideoPlayerLayer;
  panelId: string;
  /** Element to return focus to when the modal closes. */
  returnFocus?: HTMLElement | null;
}

/** A playing audio element handed over by an unmounted `keepPlaying` widget. */
export interface ParkedAudio {
  audio: HTMLAudioElement;
  /** The widget lowered music and ambient; the holder keeps them lowered. */
  ducked: boolean;
  /** Event template for the widget (`pause` / `ended` while parked). */
  event: Omit<WidgetEvent, 'type'>;
}

interface Parked extends ParkedAudio {
  handle: WidgetPlaybackHandle;
  release: () => void;
  muteSub: Subscription;
}

@Injectable()
export class WidgetPlaybackService implements OnDestroy {
  private readonly engine = inject(AudioEngineService, { optional: true });
  private readonly handles = new Set<WidgetPlaybackHandle>();
  private readonly parked = new Map<string, Parked>();
  private holder: HTMLElement | null = null;
  private readonly playing = new BehaviorSubject<string | null>(null);
  private readonly modalOpen = new BehaviorSubject<boolean>(false);
  private readonly videoRequests = new Subject<VideoModalRequest>();
  private readonly eventsSubject = new Subject<WidgetEvent>();

  /** Id of the playing widget, or null. */
  readonly playing$: Observable<string | null> = this.playing.asObservable();
  /** A widget plays or the video modal is open (holds autoplay). */
  readonly active$: Observable<boolean> = combineLatest([this.playing, this.modalOpen]).pipe(
    map(([playing, modal]) => playing !== null || modal),
    distinctUntilChanged()
  );
  readonly videoRequests$: Observable<VideoModalRequest> = this.videoRequests.asObservable();
  readonly events$: Observable<WidgetEvent> = this.eventsSubject.asObservable();

  isActive(): boolean {
    return this.playing.value !== null || this.modalOpen.value;
  }

  /**
   * Register a widget instance. Handles are kept per instance: the same
   * widget can be mounted twice for a moment (a page transition renders the
   * outgoing page as well), and one instance unmounting must not drop the
   * other.
   */
  register(handle: WidgetPlaybackHandle): void {
    this.handles.add(handle);
  }

  unregister(handle: WidgetPlaybackHandle): void {
    this.handles.delete(handle);
    if (this.playing.value === handle.id && !this.parked.has(handle.id) && !this.hasHandle(handle.id)) {
      this.playing.next(null);
    }
  }

  /** `id` started playing: every other widget pauses. */
  notifyPlaying(id: string): void {
    for (const handle of [...this.handles]) {
      if (handle.id !== id) handle.pause();
    }
    this.playing.next(id);
  }

  /** `id` paused or ended. */
  notifyStopped(id: string): void {
    if (this.playing.value === id) this.playing.next(null);
  }

  /** The reader moves to another panel: every widget pauses except `keepPlaying` audio. */
  pauseForNavigation(): void {
    for (const handle of [...this.handles]) {
      if (!handle.keepPlaying?.()) handle.pause();
    }
    const id = this.playing.value;
    if (id !== null && !this.parked.has(id) && ![...this.handles].some((h) => h.id === id && h.keepPlaying?.())) {
      this.playing.next(null);
    }
  }

  /** Pause every widget, `keepPlaying` audio included (the video modal opens). */
  pauseAll(): void {
    for (const handle of [...this.handles]) handle.pause();
    this.playing.next(null);
  }

  /**
   * Take over a playing `<audio>` element of an unmounting `keepPlaying`
   * widget. Moving it into the holder within the same task keeps it playing
   * (a media element only pauses when it is still out of the document once
   * the task ends).
   */
  park(id: string, parked: ParkedAudio): void {
    if (typeof document === 'undefined') {
      parked.audio.pause();
      return;
    }
    this.releaseParked(id, false);
    const { audio } = parked;
    this.holderElement().appendChild(audio);
    const handle: WidgetPlaybackHandle = { id, pause: () => audio.pause(), keepPlaying: () => true };
    const onStop = (type: 'pause' | 'ended') => () => {
      this.releaseParked(id, true);
      this.notifyStopped(id);
      this.emit({ ...parked.event, type });
    };
    const onPause = onStop('pause');
    const onEnded = onStop('ended');
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    const muteSub = this.engine?.masterMuted$.subscribe((muted) => (audio.muted = muted)) ?? new Subscription();
    this.parked.set(id, {
      ...parked,
      handle,
      muteSub,
      release: () => {
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('ended', onEnded);
      },
    });
    this.handles.add(handle);
    this.playing.next(id);
  }

  /** A widget mounts: hand back its parked audio (still playing), or null. */
  unpark(id: string): ParkedAudio | null {
    const entry = this.parked.get(id);
    if (!entry) return null;
    this.releaseParked(id, false);
    return { audio: entry.audio, ducked: entry.ducked, event: entry.event };
  }

  /** Drop a parked entry; `stop` also removes the element and the duck. */
  private releaseParked(id: string, stop: boolean): void {
    const entry = this.parked.get(id);
    if (!entry) return;
    this.parked.delete(id);
    entry.release();
    entry.muteSub.unsubscribe();
    this.handles.delete(entry.handle);
    if (stop) {
      entry.audio.pause();
      entry.audio.remove();
      if (entry.ducked) {
        this.engine?.setRoleDuck('music', 1);
        this.engine?.setRoleDuck('ambient', 1);
      }
    }
  }

  private holderElement(): HTMLElement {
    if (!this.holder || !this.holder.isConnected) {
      this.holder = document.createElement('div');
      this.holder.setAttribute('data-pw-parked-audio', '');
      this.holder.hidden = true;
      document.body.appendChild(this.holder);
    }
    return this.holder;
  }

  private hasHandle(id: string): boolean {
    for (const handle of this.handles) if (handle.id === id) return true;
    return false;
  }

  setModalOpen(open: boolean): void {
    this.modalOpen.next(open);
  }

  openVideo(request: VideoModalRequest): void {
    this.videoRequests.next(request);
  }

  emit(event: WidgetEvent): void {
    this.eventsSubject.next(event);
  }

  ngOnDestroy(): void {
    for (const id of [...this.parked.keys()]) this.releaseParked(id, true);
    this.holder?.remove();
    this.holder = null;
    this.handles.clear();
    this.playing.complete();
    this.modalOpen.complete();
    this.videoRequests.complete();
    this.eventsSubject.complete();
  }
}
