/**
 * User Gesture Service
 * Tracks whether the user has produced a "gesture" (click / tap / keydown)
 * during this session. Browsers block autoplay with audio before such a
 * gesture, so video playback started programmatically (e.g. on-view) must
 * begin muted until this flag is set.
 *
 * Hover does NOT count as a gesture (per autoplay policy).
 */

import { Injectable, OnDestroy, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/** Events that count as a user gesture for autoplay-with-audio purposes. */
const GESTURE_EVENTS: readonly (keyof DocumentEventMap)[] = [
  'pointerdown',
  'mousedown',
  'touchstart',
  'keydown',
  'click',
];

@Injectable({
  providedIn: 'root',
})
export class UserGestureService implements OnDestroy {
  private readonly zone = inject(NgZone);

  private readonly interacted$ = new BehaviorSubject<boolean>(false);

  /** Emits `false` initially, then `true` once (and stays true). */
  readonly userHasInteracted$: Observable<boolean> = this.interacted$.asObservable();

  private readonly boundHandler = (): void => this.markInteracted();

  private listenersAttached = false;

  constructor() {
    this.attachListeners();
  }

  /** Whether a user gesture has been registered this session. */
  hasInteracted(): boolean {
    return this.interacted$.value;
  }

  /**
   * Explicitly mark that a user gesture occurred (e.g. clicking an unmute
   * affordance). Idempotent; detaches the global listeners once set.
   */
  markInteracted(): void {
    if (this.interacted$.value) {
      return;
    }
    this.interacted$.next(true);
    this.detachListeners();
  }

  private attachListeners(): void {
    if (this.listenersAttached || typeof document === 'undefined') {
      return;
    }
    this.listenersAttached = true;
    // Run outside Angular to avoid change-detection churn on global input.
    this.zone.runOutsideAngular(() => {
      for (const type of GESTURE_EVENTS) {
        document.addEventListener(type, this.boundHandler, {
          capture: true,
          passive: true,
        });
      }
    });
  }

  private detachListeners(): void {
    if (!this.listenersAttached || typeof document === 'undefined') {
      return;
    }
    this.listenersAttached = false;
    for (const type of GESTURE_EVENTS) {
      document.removeEventListener(type, this.boundHandler, { capture: true });
    }
  }

  ngOnDestroy(): void {
    this.detachListeners();
    this.interacted$.complete();
  }
}
