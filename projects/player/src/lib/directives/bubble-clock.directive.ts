/**
 * Bubble Clock Directive
 *
 * Owns the clock that timed speech balloons wait on (schema 1.10
 * `SpeechBubble.showAtMs`). Sits on a panel's host element — the same element
 * that carries `pwPanelAnimation` — and `pw-speech-bubbles` inside it injects
 * the directive to read `clock`. The host outlives the overlay (the speech
 * toggle re-creates the overlay, fonts / resize / locale re-render it), so a
 * balloon that has appeared never disappears again and one not yet due is
 * never shown early.
 *
 * How the clock runs:
 *
 * - **Panel with a video layer:** starts when one of its videos starts playing
 *   (native `playing`, captured on the host — media events do not bubble but
 *   do pass through the capture phase), pauses while every video is paused or
 *   buffering, resumes on the next `playing`. The end of a pass (`pause` with
 *   `ended`) does not stop it: a balloon timed after the clip still appears.
 *   With an `on-click` / `on-hover` video the reader's click or hover starts it.
 * - **Any other panel:** starts when the panel is shown (the panel animation
 *   rule, `observePanelShown`), pauses while it is scrolled away or the tab is
 *   hidden.
 * - **Done right away** (every balloon shown): no timed balloon on the panel,
 *   reduced motion, print renders, static copies (the outgoing panel of a
 *   transition).
 * - A new `pwBubbleClockKey` (another panel shown in the same host) restarts
 *   it from 0. Other input changes restart it only when they change how it
 *   runs (timed balloons appear / disappear, the video layers change).
 *
 * Everything runs outside the Angular zone; the overlay reacts to
 * `clock.changes$` by touching the DOM directly.
 */
import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, inject } from '@angular/core';
import type { Panel } from '../types';
import { BubbleClock } from '../utils/bubble-clock';
import { hasTimedBubbles, panelVideoLayerIds } from '../utils/bubble-timing-utils';
import { observePanelShown } from '../utils/panel-visibility';
import { shouldReduceMotion } from '../utils/animation-utils';
import { isPrintRender } from '../utils/widget-utils';

/** Video elements whose playback drives the clock: the ones rendered by video layers. */
const VIDEO_SELECTOR = 'pw-video-layer video';

@Directive({
  selector: '[pwBubbleClock]',
  standalone: true,
})
export class BubbleClockDirective implements OnChanges, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  /** The shown panel: its balloons and video layers decide how the clock runs. */
  @Input('pwBubbleClock') panel: Pick<Panel, 'speechBubbles' | 'layers'> | null | undefined;

  /** Identity of the shown panel — a change restarts the clock. */
  @Input() pwBubbleClockKey = '';

  /** Reduced motion: every balloon at once. Unset: the OS preference. */
  @Input() pwBubbleClockReducedMotion: boolean | undefined;

  /** Hold the end state (e.g. the outgoing panel of a transition): every balloon at once. */
  @Input() pwBubbleClockStatic = false;

  /** The clock the balloons of this panel wait on. */
  readonly clock = new BubbleClock();

  private signature: string | null = null;
  private readonly cleanups: (() => void)[] = [];
  private shown = false;

  ngOnChanges(): void {
    const signature = this.computeSignature();
    if (signature === this.signature) return;
    this.signature = signature;
    this.restart();
  }

  ngOnDestroy(): void {
    this.teardown();
    this.clock.dispose();
  }

  private computeSignature(): string {
    return [
      this.pwBubbleClockKey,
      this.pwBubbleClockStatic ? 's' : '',
      this.isReducedMotion() ? 'r' : '',
      hasTimedBubbles(this.panel) ? 't' : '',
      panelVideoLayerIds(this.panel).join(','),
    ].join('|');
  }

  private isReducedMotion(): boolean {
    return this.pwBubbleClockReducedMotion ?? shouldReduceMotion();
  }

  private restart(): void {
    this.teardown();
    this.clock.reset();
    if (this.pwBubbleClockStatic || this.isReducedMotion() || isPrintRender() || !hasTimedBubbles(this.panel)) {
      this.clock.finish();
      return;
    }
    const hasVideo = panelVideoLayerIds(this.panel).length > 0;
    this.zone.runOutsideAngular(() => (hasVideo ? this.followVideo() : this.followVisibility()));
  }

  private teardown(): void {
    while (this.cleanups.length) this.cleanups.pop()?.();
    this.shown = false;
  }

  /** Video panel: run while one of the panel's videos plays. */
  private followVideo(): void {
    const onPlaying = (event: Event): void => {
      if (this.layerVideo(event)) this.clock.start();
    };
    const onHold = (event: Event): void => {
      const video = this.layerVideo(event);
      if (!video) return;
      // The end of a pass is not a pause of the dialogue: a balloon timed
      // after the clip still appears (on the wall clock).
      if (event.type === 'pause' && video.ended) return;
      if (this.anotherVideoPlays(video)) return;
      this.clock.pause();
    };
    this.listen(this.host, 'playing', onPlaying);
    this.listen(this.host, 'pause', onHold);
    this.listen(this.host, 'waiting', onHold);
    // Re-armed while a video already plays (e.g. timed balloons were added).
    if (this.anotherVideoPlays(null)) this.clock.start();
  }

  /** Image / widget panel: run while the panel is shown and the tab visible. */
  private followVisibility(): void {
    const stop = observePanelShown(this.host, (shown) => {
      this.shown = shown;
      this.syncVisibility();
    });
    this.cleanups.push(stop);
    if (typeof document !== 'undefined') {
      this.listen(document, 'visibilitychange', () => this.syncVisibility(), false);
    }
  }

  private syncVisibility(): void {
    const tabHidden = typeof document !== 'undefined' && document.hidden;
    if (this.shown && !tabHidden) this.clock.start();
    else this.clock.pause();
  }

  /** The event's target when it is a video rendered by a video layer of this panel. */
  private layerVideo(event: Event): HTMLVideoElement | null {
    const target = event.target;
    if (typeof HTMLVideoElement === 'undefined' || !(target instanceof HTMLVideoElement)) return null;
    return target.closest('pw-video-layer') && this.host.contains(target) ? target : null;
  }

  /** Whether a layer video of this panel other than `except` is playing right now. */
  private anotherVideoPlays(except: HTMLVideoElement | null): boolean {
    const videos = Array.from(this.host.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR));
    return videos.some((video) => video !== except && !video.paused && !video.ended && video.readyState > 2);
  }

  private listen(target: EventTarget, type: string, handler: (event: Event) => void, capture = true): void {
    target.addEventListener(type, handler, capture);
    this.cleanups.push(() => target.removeEventListener(type, handler, capture));
  }
}
