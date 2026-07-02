/**
 * Visibility Service
 *
 * Thin IntersectionObserver wrapper used by the page-view video sequencer to
 * decide which panel placements are on-screen. A placement counts as
 * "visible" once at least `VISIBILITY_THRESHOLD` (50 %) of its box intersects
 * the viewport, per the video-panels concept (§4.2).
 *
 * SSR-safe: when `IntersectionObserver` / `window` are unavailable the service
 * degrades gracefully — `observe()` is a no-op and no visibility changes are
 * emitted (the caller keeps whatever initial state it had).
 *
 * The service is intentionally generic (keyed by a caller-supplied id) so it
 * can be reused for lazy-loading later.
 */

import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** Minimum intersection ratio for a target to count as visible. */
export const VISIBILITY_THRESHOLD = 0.5;

/** A single visibility state change. */
export interface VisibilityChange {
  /** Caller-supplied id for the observed target. */
  id: string;
  /** Whether the target is now considered visible (>= threshold). */
  visible: boolean;
}

@Injectable({ providedIn: 'root' })
export class VisibilityService implements OnDestroy {
  private observer?: IntersectionObserver;

  /** element → id, so callbacks can resolve the caller's id. */
  private readonly idByElement = new Map<Element, string>();

  /** id → element, to support unobserve/replace by id. */
  private readonly elementById = new Map<string, Element>();

  /** Last known visibility per id. */
  private readonly visible = new Map<string, boolean>();

  private readonly changes$ = new Subject<VisibilityChange>();

  /** Stream of visibility changes (only emits on transitions). */
  readonly changes: Observable<VisibilityChange> = this.changes$.asObservable();

  /**
   * Whether IntersectionObserver is available in this environment (false in
   * SSR / very old browsers).
   */
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof IntersectionObserver !== 'undefined'
    );
  }

  /**
   * Start observing `element` under the given `id`. Re-observing the same id
   * replaces the previous element. No-op when unsupported.
   */
  observe(id: string, element: Element): void {
    if (!this.isSupported() || !element) {
      return;
    }
    // Replace any previous element registered under this id.
    const previous = this.elementById.get(id);
    if (previous && previous !== element) {
      this.observer?.unobserve(previous);
      this.idByElement.delete(previous);
    }

    if (!this.observer) {
      this.observer = new IntersectionObserver(
        (entries) => this.onEntries(entries),
        { threshold: [VISIBILITY_THRESHOLD] }
      );
    }

    this.idByElement.set(element, id);
    this.elementById.set(id, element);
    this.observer.observe(element);
  }

  /** Stop observing the target registered under `id`. */
  unobserve(id: string): void {
    const element = this.elementById.get(id);
    if (element) {
      this.observer?.unobserve(element);
      this.idByElement.delete(element);
    }
    this.elementById.delete(id);
    this.visible.delete(id);
  }

  /** Synchronous last-known visibility for an id (defaults to false). */
  isVisible(id: string): boolean {
    return this.visible.get(id) ?? false;
  }

  /** Stop observing everything (e.g. when leaving page view). */
  clear(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.idByElement.clear();
    this.elementById.clear();
    this.visible.clear();
  }

  ngOnDestroy(): void {
    this.clear();
    this.changes$.complete();
  }

  private onEntries(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const id = this.idByElement.get(entry.target);
      if (id === undefined) {
        continue;
      }
      const nowVisible =
        entry.isIntersecting &&
        entry.intersectionRatio >= VISIBILITY_THRESHOLD;
      const wasVisible = this.visible.get(id) ?? false;
      if (nowVisible !== wasVisible) {
        this.visible.set(id, nowVisible);
        this.changes$.next({ id, visible: nowVisible });
      }
    }
  }
}
