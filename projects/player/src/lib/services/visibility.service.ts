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
 *
 * An id may map to MORE THAN ONE element (e.g. a panel with several video
 * layers all keyed by the same placement id): the id counts as visible while
 * *any* of its elements meets the threshold. Callers add elements with
 * {@link observe}, remove one with {@link unobserveElement}, or drop the whole
 * id with {@link unobserve}.
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

  /** id → its observed elements (a panel may have several video hosts). */
  private readonly elementsById = new Map<string, Set<Element>>();

  /** Elements currently intersecting at/above the threshold. */
  private readonly visibleElements = new Set<Element>();

  /** Last known aggregate visibility per id (true when any element visible). */
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
   * Start observing `element` under the given `id`. Multiple elements may be
   * observed under one id — they accumulate, and the id is visible while any
   * of them meets the threshold. Re-observing the same element under a new id
   * moves it. No-op when unsupported.
   */
  observe(id: string, element: Element): void {
    if (!this.isSupported() || !element) {
      return;
    }
    // Element already tracked under a different id → move it (drop from the
    // old id's set and recompute that id's aggregate).
    const previousId = this.idByElement.get(element);
    if (previousId !== undefined && previousId !== id) {
      this.detachElement(element, previousId);
      this.recomputeAggregate(previousId);
    }

    if (!this.observer) {
      this.observer = new IntersectionObserver(
        (entries) => this.onEntries(entries),
        { threshold: [VISIBILITY_THRESHOLD] }
      );
    }

    this.idByElement.set(element, id);
    let set = this.elementsById.get(id);
    if (!set) {
      set = new Set<Element>();
      this.elementsById.set(id, set);
    }
    set.add(element);
    this.observer.observe(element);
  }

  /** Stop observing every element registered under `id`. */
  unobserve(id: string): void {
    const set = this.elementsById.get(id);
    if (set) {
      for (const element of set) {
        this.observer?.unobserve(element);
        this.idByElement.delete(element);
        this.visibleElements.delete(element);
      }
    }
    this.elementsById.delete(id);
    this.visible.delete(id);
  }

  /**
   * Stop observing a single `element`, leaving any siblings under the same id
   * in place. The id's aggregate visibility is recomputed (and may transition
   * to hidden if that element was the only visible one).
   */
  unobserveElement(element: Element): void {
    if (!element) {
      return;
    }
    const id = this.idByElement.get(element);
    if (id === undefined) {
      return;
    }
    this.detachElement(element, id);
    const set = this.elementsById.get(id);
    if (!set || set.size === 0) {
      this.elementsById.delete(id);
      this.visible.delete(id);
    } else {
      this.recomputeAggregate(id);
    }
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
    this.elementsById.clear();
    this.visibleElements.clear();
    this.visible.clear();
  }

  ngOnDestroy(): void {
    this.clear();
    this.changes$.complete();
  }

  /** Detach one element from bookkeeping (observer + maps), no recompute. */
  private detachElement(element: Element, id: string): void {
    this.observer?.unobserve(element);
    this.idByElement.delete(element);
    this.visibleElements.delete(element);
    this.elementsById.get(id)?.delete(element);
  }

  private onEntries(entries: IntersectionObserverEntry[]): void {
    const affectedIds = new Set<string>();
    for (const entry of entries) {
      const id = this.idByElement.get(entry.target);
      if (id === undefined) {
        continue;
      }
      const elementVisible =
        entry.isIntersecting &&
        entry.intersectionRatio >= VISIBILITY_THRESHOLD;
      if (elementVisible) {
        this.visibleElements.add(entry.target);
      } else {
        this.visibleElements.delete(entry.target);
      }
      affectedIds.add(id);
    }
    for (const id of affectedIds) {
      this.recomputeAggregate(id);
    }
  }

  /**
   * Recompute an id's aggregate visibility (visible when any of its elements
   * is), emitting only on a transition.
   */
  private recomputeAggregate(id: string): void {
    const set = this.elementsById.get(id);
    let nowVisible = false;
    if (set) {
      for (const element of set) {
        if (this.visibleElements.has(element)) {
          nowVisible = true;
          break;
        }
      }
    }
    const wasVisible = this.visible.get(id) ?? false;
    if (nowVisible !== wasVisible) {
      this.visible.set(id, nowVisible);
      this.changes$.next({ id, visible: nowVisible });
    }
  }
}
