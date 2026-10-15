/**
 * Sequence Audio Service
 *
 * Plays a work's timeline audio (`chapters[].sequenceAudioTracks` — music,
 * ambience, voiceover beds) while the reader moves through the panels:
 *
 * - entering a panel starts every track that covers it, at the right offset
 *   (a jump into the middle of a scene picks the music up where it is);
 * - a track keeps playing while the reader stays inside its range, so
 *   music does not restart on every panel; leaving the range fades it out
 *   (its `fadeOut`, else 250 ms);
 * - a track that starts or ends inside a panel is delayed / stopped there;
 * - `span: 'work'` tracks continue across chapter boundaries.
 *
 * Placement follows the CMS timeline (see sequence-audio-timeline.ts). Roles
 * map onto the engine buses, so the reader's Audio / SFX / Speech toggles
 * apply. Tracks refused by the autoplay policy are retried on the first
 * user gesture.
 */

import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { AudioEngineService } from './audio-engine.service';
import { ManifestService } from './manifest.service';
import { UserGestureService } from './user-gesture.service';
import { resolveAudioAsset } from '../utils/audio-asset-utils';
import {
  DEFAULT_PANEL_MS,
  PanelCue,
  TrackRange,
  WorkTimeline,
  buildWorkTimeline,
  cuesForPanel,
  resolveTrackRanges,
} from '../utils/sequence-audio-timeline';
import type { PanelWaveManifest } from '../types';

/** Fade when a track ends because the reader left its range (unless it has its own fadeOut). */
export const SEQUENCE_AUDIO_LEAVE_FADE_MS = 250;

/** Engine ids are prefixed so they never collide with panel audio (asset ids). */
export const sequenceEngineId = (trackId: string) => `seq:${trackId}`;

interface Playing {
  cue: PanelCue;
  startTimer?: ReturnType<typeof setTimeout>;
  stopTimer?: ReturnType<typeof setTimeout>;
}

@Injectable({
  providedIn: 'root',
})
export class SequenceAudioService implements OnDestroy {
  private readonly engine = inject(AudioEngineService);
  private readonly manifestService = inject(ManifestService);
  private readonly gesture = inject(UserGestureService);

  /** Tracks the current panel wants, by engine id. */
  private desired = new Map<string, Playing>();
  /** Refused by the autoplay policy; retried on the first gesture. */
  private blocked = new Set<string>();
  private warned = new Set<string>();

  private layoutCache?: { manifest: PanelWaveManifest | null; format: string | null; timeline: WorkTimeline; ranges: TrackRange[] };

  private readonly gestureSub: Subscription;

  constructor() {
    this.gestureSub = this.gesture.userHasInteracted$.subscribe((interacted) => {
      if (interacted) {
        this.onUserGesture();
      }
    });
  }

  ngOnDestroy(): void {
    this.gestureSub.unsubscribe();
    this.stopAll();
  }

  /**
   * Follow the reader: call on every panel change (and when the page format
   * changes). `panelId` undefined = silence (cover, locked panel, teardown).
   */
  syncPanel(panelId: string | undefined, format: string | null): void {
    const { timeline, ranges } = this.layout(format);
    const entry = panelId ? timeline.byPanel.get(panelId) : undefined;
    const cues = entry ? cuesForPanel(ranges, entry) : [];
    const next = new Map(cues.map((cue) => [sequenceEngineId(cue.range.track.id), cue]));

    for (const [id, playing] of this.desired) {
      if (!next.has(id)) {
        this.release(id, this.leaveFade(playing.cue));
        this.desired.delete(id);
      }
    }

    for (const [id, cue] of next) {
      const playing = this.desired.get(id);
      if (playing) {
        // Still inside its range (started, pending, blocked — or a one-shot
        // that already ended): never restart it, only re-arm an end that
        // falls inside this panel.
        playing.cue = cue;
        this.armStop(id, playing);
        continue;
      }
      this.schedule(id, cue);
    }
  }

  /** Stop everything this service started. */
  stopAll(): void {
    for (const id of Array.from(this.desired.keys())) {
      this.release(id, 0);
    }
    this.desired.clear();
  }

  /** Engine ids of the tracks the current panel wants (started, pending or blocked). */
  getDesiredTrackIds(): string[] {
    return Array.from(this.desired.keys());
  }

  // ---------------------------------------------------------------------------

  private layout(format: string | null): { timeline: WorkTimeline; ranges: TrackRange[] } {
    const manifest = this.manifestService.getManifest();
    const cache = this.layoutCache;
    if (cache && cache.manifest === manifest && cache.format === format) {
      return cache;
    }
    const seconds = Number(manifest?.settings?.ui?.secondsPerPanel);
    const defaultMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_PANEL_MS;
    const timeline = buildWorkTimeline(manifest, format, defaultMs);
    const ranges = resolveTrackRanges(manifest, timeline, format);
    this.layoutCache = { manifest, format, timeline, ranges };
    return this.layoutCache;
  }

  private schedule(id: string, cue: PanelCue): void {
    this.release(id, 0);
    const playing: Playing = { cue };
    this.desired.set(id, playing);
    if (cue.delayMs > 0) {
      playing.startTimer = setTimeout(() => {
        playing.startTimer = undefined;
        this.start(id, playing, 0);
      }, cue.delayMs);
    } else {
      this.start(id, playing, cue.offsetMs);
    }
    this.armStop(id, playing);
  }

  /** Stop the track inside this panel when its range ends here. */
  private armStop(id: string, playing: Playing): void {
    if (playing.stopTimer !== undefined) {
      clearTimeout(playing.stopTimer);
      playing.stopTimer = undefined;
    }
    const stopAfter = playing.cue.stopAfterMs;
    if (stopAfter === undefined) {
      return;
    }
    playing.stopTimer = setTimeout(() => {
      playing.stopTimer = undefined;
      if (this.desired.get(id) === playing) {
        this.desired.delete(id);
        this.release(id, this.leaveFade(playing.cue));
      }
    }, stopAfter);
  }

  private start(id: string, playing: Playing, offsetMs: number): void {
    const track = playing.cue.range.track;
    const resolved = resolveAudioAsset(
      this.manifestService.getAsset(track.assetId),
      this.manifestService.getManifest()?.assets?.base
    );
    if ('error' in resolved) {
      this.warnOnce(track.assetId, resolved.error);
      return;
    }
    const rate = typeof track.playbackRate === 'number' && isFinite(track.playbackRate) ? Math.max(0.25, Math.min(4, track.playbackRate)) : 1;
    this.blocked.delete(id);
    this.engine
      .play(
        {
          id,
          url: resolved.url,
          role: track.role,
          loop: track.loop ?? resolved.loop ?? false,
          volume: typeof track.volume === 'number' && isFinite(track.volume) ? Math.max(0, Math.min(2, track.volume)) : 1,
          fadeIn: track.fadeIn,
          fadeOut: track.fadeOut,
          playbackRate: rate,
        },
        (offsetMs / 1000) * rate
      )
      .catch((error: unknown) => {
        if (this.isAutoplayRefusal(error) && !this.gesture.hasInteracted() && this.desired.get(id) === playing) {
          this.blocked.add(id);
        }
      });
  }

  private release(id: string, fadeMs: number): void {
    const playing = this.desired.get(id);
    if (playing?.startTimer !== undefined) {
      clearTimeout(playing.startTimer);
      playing.startTimer = undefined;
    }
    if (playing?.stopTimer !== undefined) {
      clearTimeout(playing.stopTimer);
      playing.stopTimer = undefined;
    }
    this.blocked.delete(id);
    if (this.engine.isActive(id)) {
      void this.engine.stop(id, fadeMs);
    }
  }

  private leaveFade(cue: PanelCue): number {
    const fadeOut = cue.range.track.fadeOut;
    return typeof fadeOut === 'number' && fadeOut > 0 ? fadeOut : SEQUENCE_AUDIO_LEAVE_FADE_MS;
  }

  private onUserGesture(): void {
    for (const id of Array.from(this.blocked)) {
      this.blocked.delete(id);
      const playing = this.desired.get(id);
      if (playing) {
        this.start(id, playing, playing.cue.offsetMs);
      }
    }
  }

  private isAutoplayRefusal(error: unknown): boolean {
    const name = (error as { name?: string } | null)?.name;
    return name === 'NotAllowedError' || name === 'AbortError';
  }

  private warnOnce(assetId: string, reason: string): void {
    if (this.warned.has(assetId)) {
      return;
    }
    this.warned.add(assetId);
    console.warn(`[SequenceAudioService] audio asset "${assetId}" ${reason}; timeline track skipped.`);
  }
}
