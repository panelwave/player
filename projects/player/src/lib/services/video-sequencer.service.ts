/**
 * Video Sequencer Service
 *
 * Implements the page-view sequential-playback semantics of the video-panels
 * concept (§4.3): the *visible* `on-view` video panels of the current page
 * play one after another in reading order. Each queue slot plays until it
 * completes **one full pass** (`once` → ended; `loop`/`pingpong`/`loop-from`
 * → one cycle, then it keeps looping muted while the next slot starts).
 *
 * Ordering: `Page.readingOrder`; fallback (missing reading order) is placement
 * order — z-index, then y, then x (§7).
 *
 * A queue slot is a **panel**, not a single video: multiple video layers in
 * one panel form one slot; they all start together and the slot completes when
 * the *longest* pass completes, i.e. when every sequenced video in the panel
 * has reported `passComplete` (§7).
 *
 * The sequencer never touches the DOM directly. Video layer components
 * register a small {@link SequencedVideo} handle; the sequencer decides which
 * slot is "active" and calls `activate()` / `deactivate()` on its videos. Each
 * handle reports back via `notifyPassComplete()`.
 *
 * Concurrency: at most one *unmuted* video plays at a time — that rule lives in
 * `VideoControllerService` (relaxed in the playback core). If a user-initiated
 * unmuted video (hover/click) starts, the host pauses the sequencer via
 * {@link pause} and resumes via {@link resume} when it ends/pauses (§4.3.4).
 *
 * Auto-advance coupling (§4.3.6): when the last queue slot completes its pass
 * the sequencer emits {@link queueComplete}; the host advances the page/panel
 * only when autoplay is on.
 */

import { Injectable, OnDestroy, inject } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { VisibilityService } from './visibility.service';

/**
 * Ordering / visibility metadata for one video, supplied at registration.
 */
export interface SequencedVideoInfo {
  /** Stable id (video layer instance id). */
  id: string;
  /** Panel this video belongs to (one queue slot per panel). */
  panelId: string;
  /** Placement id used for visibility lookup (usually the panelId). */
  placementId: string;
  /**
   * Index of this panel in `Page.readingOrder`, or -1 when reading order is
   * absent / does not contain the panel. Falls back to placement order.
   */
  readingOrderIndex: number;
  /** Placement fallback ordering key: z-index (higher last). */
  z: number;
  /** Placement fallback ordering key: y (top first). */
  y: number;
  /** Placement fallback ordering key: x (left first). */
  x: number;
  /**
   * Whether this video participates in the sequence at all — only page-view
   * `on-view` videos do. hover/click videos register as non-sequenced so the
   * sequencer knows about them for bookkeeping but never queues them.
   */
  sequenced: boolean;
}

/**
 * Control handle the sequencer uses to drive a registered video component.
 */
export interface SequencedVideo extends SequencedVideoInfo {
  /** Host element observed for visibility (page view). */
  element: Element;
  /** Make this video part of the active slot: start / resume playback. */
  activate(): void;
  /** Deactivate (stop + reset) when removed from the queue / on pause. */
  deactivate(): void;
  /**
   * Pause keeping the position (§4.2 hover/click videos whose panel leaves
   * the viewport — they resume from the same spot on user interaction).
   */
  suspend?(): void;
  /** Optional hook invoked right before a stalled slot is skipped. */
  onStallSkip?(): void;
}

/** Default stall-skip timeout: 10 s (§7). */
export const DEFAULT_STALL_TIMEOUT_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class VideoSequencerService implements OnDestroy {
  private readonly visibility = inject(VisibilityService);

  /** All registered videos keyed by id (sequenced and non-sequenced). */
  private readonly registry = new Map<string, SequencedVideo>();

  /** Ordered queue of *sequenced + visible* panel ids (slots). */
  private queue: string[] = [];

  /** Panel id of the currently active (playing) slot, if any. */
  private activePanelId: string | null = null;

  /**
   * For the active slot: ids of its videos that have not yet completed their
   * pass. The slot completes when this set is empty (longest pass wins, §7).
   */
  private pendingPass = new Set<string>();

  /** Whether the sequencer is paused (e.g. an unmuted user video is playing). */
  private paused = false;

  /** Whether a page-view sequence is currently running. */
  private running = false;

  /** Stall-skip timer for the active slot. */
  private stallTimer?: ReturnType<typeof setTimeout>;

  /**
   * Stall-skip timeout (ms). If the active slot makes no progress for this
   * long the sequencer skips it (§7). Injectable via {@link setStallTimeout}
   * rather than a magic number.
   */
  private stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS;

  private visibilitySub?: Subscription;

  private readonly queueComplete$ = new Subject<void>();

  /**
   * Emits when the queue has completed its last slot's pass (§4.3.6). The
   * host advances the page/panel only when autoplay is enabled.
   */
  readonly queueComplete: Observable<void> = this.queueComplete$.asObservable();

  /** Configure the stall-skip timeout (ms). */
  setStallTimeout(ms: number): void {
    if (Number.isFinite(ms) && ms > 0) {
      this.stallTimeoutMs = ms;
    }
  }

  /** Current stall-skip timeout (ms). */
  getStallTimeout(): number {
    return this.stallTimeoutMs;
  }

  /** The visibility service instance (exposed so hosts can observe elements). */
  getVisibility(): VisibilityService {
    return this.visibility;
  }

  /**
   * Begin a page-view sequence. Clears prior state and subscribes to
   * visibility changes so newly-visible videos append and leaving ones drop.
   * Already-registered sequenced videos (components reused across a page
   * change) are re-observed and re-queued.
   */
  start(): void {
    this.reset();
    this.running = true;
    this.visibilitySub = this.visibility.changes.subscribe((change) =>
      this.onVisibilityChange(change.id, change.visible)
    );
    // Re-enlist videos that are still registered from a previous run.
    for (const video of this.registry.values()) {
      if (video.element) {
        this.visibility.observe(video.placementId, video.element);
      }
      if (!video.sequenced) {
        continue;
      }
      if (
        !this.visibility.isSupported() ||
        this.visibility.isVisible(video.placementId)
      ) {
        this.appendSlot(video.panelId);
      }
    }
  }

  /** Stop the sequence and release all observers/timers. */
  reset(): void {
    this.running = false;
    this.paused = false;
    this.activePanelId = null;
    this.pendingPass.clear();
    this.queue = [];
    this.clearStallTimer();
    this.visibilitySub?.unsubscribe();
    this.visibilitySub = undefined;
    this.visibility.clear();
    // Deactivate everything currently registered.
    for (const video of this.registry.values()) {
      video.deactivate();
    }
  }

  ngOnDestroy(): void {
    this.reset();
    this.queueComplete$.complete();
  }

  /**
   * Register a video with the sequencer. Sequenced videos begin observing
   * their placement for visibility; when already visible their panel is
   * appended to the queue (and playback kicks off if the queue was idle).
   */
  register(video: SequencedVideo): void {
    this.registry.set(video.id, video);
    if (!this.running) {
      return;
    }
    // Observe every page-view video's placement: sequenced ones drive the
    // queue; hover/click ones are suspended when they leave the viewport
    // (§4.2, position kept).
    if (video.element) {
      this.visibility.observe(video.placementId, video.element);
    }
    if (!video.sequenced) {
      return;
    }
    // If IntersectionObserver is unsupported (SSR/tests without DOM), treat as
    // visible so the sequence still runs.
    if (!this.visibility.isSupported() || this.visibility.isVisible(video.placementId)) {
      this.appendSlot(video.panelId);
    }
    // A late-arriving video for the already-active slot must start too.
    if (video.panelId === this.activePanelId) {
      this.pendingPass.add(video.id);
      if (!this.paused) {
        video.activate();
      }
    }
  }

  /** Remove a video (component destroyed / no longer sequenced). */
  unregister(id: string): void {
    const video = this.registry.get(id);
    this.registry.delete(id);
    if (!video) {
      return;
    }
    // If it was part of the active slot, drop it from the pending set and
    // complete the slot early if it was the last outstanding video.
    if (video.panelId === this.activePanelId) {
      this.pendingPass.delete(id);
      if (this.pendingPass.size === 0) {
        this.completeActiveSlot();
        return;
      }
    }
    // If no more sequenced videos remain for this panel, drop the slot.
    if (!this.panelHasSequencedVideos(video.panelId)) {
      this.queue = this.queue.filter((pid) => pid !== video.panelId);
      this.visibility.unobserve(video.placementId);
    }
  }

  /**
   * Pause the sequence (an unmuted user-initiated video started). The active
   * slot is deactivated; {@link resume} restarts it from the front.
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clearStallTimer();
    if (this.activePanelId) {
      // Re-queue the paused slot at the front so resume replays it.
      const panelId = this.activePanelId;
      this.deactivatePanel(panelId);
      this.activePanelId = null;
      this.pendingPass.clear();
      if (!this.queue.includes(panelId)) {
        this.queue.unshift(panelId);
      }
    }
  }

  /** Resume the sequence after a pause. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (!this.activePanelId) {
      this.playNext();
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Current queue of panel-slot ids — for tests/inspection. */
  getQueue(): readonly string[] {
    return this.queue;
  }

  /** Currently active slot (panel id) or null. */
  getActivePanelId(): string | null {
    return this.activePanelId;
  }

  /**
   * Called by a video when it completes one full pass. The slot advances only
   * once every sequenced video in the active panel has completed (§7). The
   * finished video keeps looping muted on its own (loop modes) or freezes
   * (once) — the sequencer does not touch it further.
   */
  notifyPassComplete(id: string): void {
    const video = this.registry.get(id);
    if (!video || video.panelId !== this.activePanelId) {
      return;
    }
    this.pendingPass.delete(id);
    if (this.pendingPass.size === 0) {
      this.completeActiveSlot();
    }
  }

  /**
   * Called by a video to report media progress — resets the stall timer for
   * the active slot.
   */
  notifyProgress(id: string): void {
    const video = this.registry.get(id);
    if (video && video.panelId === this.activePanelId) {
      this.armStallTimer();
    }
  }

  /**
   * Called by a video to signal it started buffering (arms the stall timer for
   * the active slot).
   */
  notifyStalling(id: string): void {
    const video = this.registry.get(id);
    if (video && video.panelId === this.activePanelId) {
      this.armStallTimer();
    }
  }

  // ---------------------------------------------------------------------------
  // Queue mechanics
  // ---------------------------------------------------------------------------

  private onVisibilityChange(placementId: string, visible: boolean): void {
    // §4.2: hover/click videos leaving the viewport pause keeping position.
    if (!visible) {
      for (const video of this.registry.values()) {
        if (!video.sequenced && video.placementId === placementId) {
          video.suspend?.();
        }
      }
    }
    // Resolve the placement id back to a panel id via any of its videos.
    const panelId = this.panelIdForPlacement(placementId);
    if (!panelId) {
      return;
    }
    if (visible) {
      this.appendSlot(panelId);
    } else {
      this.removeSlot(panelId);
    }
  }

  private appendSlot(panelId: string): void {
    if (this.queue.includes(panelId) || panelId === this.activePanelId) {
      return;
    }
    this.queue.push(panelId);
    this.sortQueue();
    if (!this.paused && this.activePanelId === null) {
      this.playNext();
    }
  }

  private removeSlot(panelId: string): void {
    const wasActive = this.activePanelId === panelId;
    this.queue = this.queue.filter((pid) => pid !== panelId);
    // Leaving the viewport: on-view videos pause + reset (§4.2).
    this.deactivatePanel(panelId);
    if (wasActive) {
      this.clearStallTimer();
      this.activePanelId = null;
      this.pendingPass.clear();
      this.advance();
    }
  }

  /** Order the queue by reading order, falling back to placement order. */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const va = this.representativeVideo(a);
      const vb = this.representativeVideo(b);
      if (!va || !vb) return 0;
      return this.compare(va, vb);
    });
  }

  private compare(a: SequencedVideoInfo, b: SequencedVideoInfo): number {
    const ra = a.readingOrderIndex;
    const rb = b.readingOrderIndex;
    const aHas = ra >= 0;
    const bHas = rb >= 0;
    // Both have a reading-order index: sort by it.
    if (aHas && bHas && ra !== rb) {
      return ra - rb;
    }
    // Reading order present for one only: it wins (comes first).
    if (aHas !== bHas) {
      return aHas ? -1 : 1;
    }
    // Fallback placement order: z, then y, then x.
    if (a.z !== b.z) return a.z - b.z;
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return 0;
  }

  /** Called when the active slot's longest pass finished. */
  private completeActiveSlot(): void {
    this.clearStallTimer();
    this.activePanelId = null;
    this.pendingPass.clear();
    this.advance();
  }

  /**
   * Advance to the next queue slot, or emit `queueComplete` when the queue is
   * exhausted.
   */
  private advance(): void {
    if (this.paused || !this.running) {
      return;
    }
    if (this.queue.length === 0) {
      this.queueComplete$.next();
      return;
    }
    this.playNext();
  }

  /** Activate the head slot of the queue (all its sequenced videos). */
  private playNext(): void {
    if (this.paused || !this.running) {
      return;
    }
    const nextPanelId = this.queue[0];
    if (!nextPanelId) {
      this.queueComplete$.next();
      return;
    }
    // Drop the head from the queue as we begin playing it: a completed loop
    // video keeps looping on its own and must not be replayed by the queue.
    this.queue = this.queue.slice(1);
    const videos = this.sequencedVideosForPanel(nextPanelId);
    if (videos.length === 0) {
      // Stale slot; try the next one.
      this.playNext();
      return;
    }
    this.activePanelId = nextPanelId;
    this.pendingPass = new Set(videos.map((v) => v.id));
    this.armStallTimer();
    for (const video of videos) {
      video.activate();
    }
  }

  // ---------------------------------------------------------------------------
  // Stall-skip
  // ---------------------------------------------------------------------------

  private armStallTimer(): void {
    this.clearStallTimer();
    if (typeof setTimeout === 'undefined') {
      return;
    }
    this.stallTimer = setTimeout(() => {
      this.onStallTimeout();
    }, this.stallTimeoutMs);
  }

  private onStallTimeout(): void {
    this.stallTimer = undefined;
    const panelId = this.activePanelId;
    if (!panelId) {
      return;
    }
    // Skip the stalled slot: notify + deactivate its videos, then move on.
    for (const video of this.sequencedVideosForPanel(panelId)) {
      video.onStallSkip?.();
      video.deactivate();
    }
    this.activePanelId = null;
    this.pendingPass.clear();
    this.advance();
  }

  private clearStallTimer(): void {
    if (this.stallTimer !== undefined) {
      clearTimeout(this.stallTimer);
      this.stallTimer = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Registry helpers
  // ---------------------------------------------------------------------------

  private sequencedVideosForPanel(panelId: string): SequencedVideo[] {
    const result: SequencedVideo[] = [];
    for (const video of this.registry.values()) {
      if (video.sequenced && video.panelId === panelId) {
        result.push(video);
      }
    }
    return result;
  }

  private panelHasSequencedVideos(panelId: string): boolean {
    for (const video of this.registry.values()) {
      if (video.sequenced && video.panelId === panelId) {
        return true;
      }
    }
    return false;
  }

  private representativeVideo(panelId: string): SequencedVideo | undefined {
    for (const video of this.registry.values()) {
      if (video.sequenced && video.panelId === panelId) {
        return video;
      }
    }
    return undefined;
  }

  private panelIdForPlacement(placementId: string): string | undefined {
    for (const video of this.registry.values()) {
      if (video.sequenced && video.placementId === placementId) {
        return video.panelId;
      }
    }
    return undefined;
  }

  private deactivatePanel(panelId: string): void {
    for (const video of this.sequencedVideosForPanel(panelId)) {
      video.deactivate();
    }
  }
}
