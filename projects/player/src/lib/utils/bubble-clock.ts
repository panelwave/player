/**
 * The clock timed speech balloons wait on (schema 1.10 `SpeechBubble.showAtMs`).
 *
 * One clock per shown panel, owned by `BubbleClockDirective` on the panel's
 * host element and read by `pw-speech-bubbles` inside it. The overlay is
 * re-rendered (and even re-created by the speech toggle) many times while a
 * panel is shown, so the "has this balloon appeared yet" state lives here and
 * not in the overlay.
 *
 * States:
 * - `waiting` — armed, time stands at 0 (panel not shown yet / video not started);
 * - `running` — time advances;
 * - `paused`  — time holds (video paused or buffering, panel scrolled away, tab hidden);
 * - `done`    — every balloon is due (reduced motion, print, no timed balloons).
 */
import { Observable, Subject } from 'rxjs';

export type BubbleClockState = 'waiting' | 'running' | 'paused' | 'done';

export class BubbleClock {
  private current: BubbleClockState = 'waiting';
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private readonly changesSubject = new Subject<BubbleClockState>();

  /** Emits the new state on every transition (not on repeated calls that change nothing). */
  readonly changes$: Observable<BubbleClockState> = this.changesSubject.asObservable();

  constructor(private readonly now: () => number = defaultNow) {}

  get state(): BubbleClockState {
    return this.current;
  }

  /** Time on the clock in ms; `Infinity` once done, so every balloon is due. */
  elapsed(): number {
    if (this.current === 'done') return Number.POSITIVE_INFINITY;
    const live = this.runningSince === null ? 0 : Math.max(0, this.now() - this.runningSince);
    return this.accumulatedMs + live;
  }

  /** Start, or resume after a pause. No effect while running or done. */
  start(): void {
    if (this.current !== 'waiting' && this.current !== 'paused') return;
    this.runningSince = this.now();
    this.transition('running');
  }

  /** Hold the time. No effect unless running. */
  pause(): void {
    if (this.current !== 'running') return;
    this.accumulatedMs = this.elapsed();
    this.runningSince = null;
    this.transition('paused');
  }

  /** Make every balloon due (reduced motion, print, nothing timed). */
  finish(): void {
    if (this.current === 'done') return;
    this.runningSince = null;
    this.transition('done');
  }

  /** Back to 0, waiting (the panel is shown again). */
  reset(): void {
    const changed = this.current !== 'waiting' || this.accumulatedMs !== 0 || this.runningSince !== null;
    this.accumulatedMs = 0;
    this.runningSince = null;
    this.current = 'waiting';
    if (changed) this.changesSubject.next('waiting');
  }

  /** Complete the change stream (the owning directive is destroyed). */
  dispose(): void {
    this.changesSubject.complete();
  }

  private transition(next: BubbleClockState): void {
    this.current = next;
    this.changesSubject.next(next);
  }
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
