/**
 * Widget playback coordination (schema 1.10+ content widgets), one per
 * player instance (provided by `PlayerShellComponent`):
 *
 * - only one audio/video widget plays at a time — starting one pauses the
 *   others;
 * - `active$` tells the shell to hold autoplay while a widget plays or the
 *   video modal is open;
 * - `pauseAll()` runs on every panel change;
 * - widgets request the video modal through `openVideo()`;
 * - every reader action is published on `events$` (shell output
 *   `widgetEvent` + tracking).
 *
 * Widgets inject it optionally, so they also work outside a shell.
 */
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, combineLatest, distinctUntilChanged, map } from 'rxjs';
import type { VideoPlayerLayer, WidgetLayerKind } from '../types';

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
}

/** What the shell needs to show the video modal. */
export interface VideoModalRequest {
  layer: VideoPlayerLayer;
  panelId: string;
  /** Element to return focus to when the modal closes. */
  returnFocus?: HTMLElement | null;
}

@Injectable()
export class WidgetPlaybackService implements OnDestroy {
  private readonly handles = new Map<string, WidgetPlaybackHandle>();
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

  register(handle: WidgetPlaybackHandle): void {
    this.handles.set(handle.id, handle);
  }

  unregister(id: string): void {
    this.handles.delete(id);
    if (this.playing.value === id) this.playing.next(null);
  }

  /** `id` started playing: every other widget pauses. */
  notifyPlaying(id: string): void {
    for (const [other, handle] of this.handles) {
      if (other !== id) handle.pause();
    }
    this.playing.next(id);
  }

  /** `id` paused or ended. */
  notifyStopped(id: string): void {
    if (this.playing.value === id) this.playing.next(null);
  }

  /** Pause every widget (panel change, page turn). */
  pauseAll(): void {
    for (const handle of this.handles.values()) handle.pause();
    this.playing.next(null);
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
    this.handles.clear();
    this.playing.complete();
    this.modalOpen.complete();
    this.videoRequests.complete();
    this.eventsSubject.complete();
  }
}
