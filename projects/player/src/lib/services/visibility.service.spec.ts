/**
 * VisibilityService tests — IntersectionObserver wrapper with the ≥50 %
 * page-view visibility threshold (video-panels concept §4.2).
 */

import {
  VisibilityService,
  VISIBILITY_THRESHOLD,
  type VisibilityChange,
} from './visibility.service';

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  observed: Element[] = [];

  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  unobserve(element: Element): void {
    this.observed = this.observed.filter((e) => e !== element);
  }

  disconnect(): void {
    this.observed = [];
  }

  /** Test helper: simulate an intersection entry for an element. */
  fire(element: Element, ratio: number): void {
    const entry = {
      target: element,
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
    } as unknown as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

describe('VisibilityService', () => {
  let service: VisibilityService;
  let originalIO: typeof IntersectionObserver;
  let changes: VisibilityChange[];

  const lastObserver = (): FakeIntersectionObserver =>
    FakeIntersectionObserver.instances[
      FakeIntersectionObserver.instances.length - 1
    ];

  beforeEach(() => {
    originalIO = window.IntersectionObserver;
    FakeIntersectionObserver.instances = [];
    (window as unknown as Record<string, unknown>)['IntersectionObserver'] =
      FakeIntersectionObserver;
    service = new VisibilityService();
    changes = [];
    service.changes.subscribe((c) => changes.push(c));
  });

  afterEach(() => {
    service.ngOnDestroy();
    (window as unknown as Record<string, unknown>)['IntersectionObserver'] =
      originalIO;
  });

  it('should report IntersectionObserver support', () => {
    expect(service.isSupported()).toBeTrue();
  });

  it('should observe with the 50% threshold', () => {
    const el = document.createElement('div');
    service.observe('a', el);
    expect(lastObserver().options?.threshold).toEqual([VISIBILITY_THRESHOLD]);
    expect(lastObserver().observed).toContain(el);
  });

  it('should emit visible=true at >= 50% intersection', () => {
    const el = document.createElement('div');
    service.observe('a', el);
    lastObserver().fire(el, 0.6);
    expect(changes).toEqual([{ id: 'a', visible: true }]);
    expect(service.isVisible('a')).toBeTrue();
  });

  it('should not count intersections below the threshold as visible', () => {
    const el = document.createElement('div');
    service.observe('a', el);
    lastObserver().fire(el, 0.3);
    expect(changes).toEqual([]);
    expect(service.isVisible('a')).toBeFalse();
  });

  it('should emit a transition back to hidden', () => {
    const el = document.createElement('div');
    service.observe('a', el);
    lastObserver().fire(el, 0.8);
    lastObserver().fire(el, 0.1);
    expect(changes).toEqual([
      { id: 'a', visible: true },
      { id: 'a', visible: false },
    ]);
  });

  it('should not emit duplicate states', () => {
    const el = document.createElement('div');
    service.observe('a', el);
    lastObserver().fire(el, 0.8);
    lastObserver().fire(el, 0.9);
    expect(changes.length).toBe(1);
  });

  it('should ignore entries for untracked elements', () => {
    const el = document.createElement('div');
    service.observe('a', el);
    lastObserver().fire(document.createElement('div'), 1);
    expect(changes).toEqual([]);
  });

  it('should stop tracking on unobserve', () => {
    const el = document.createElement('div');
    service.observe('a', el);
    lastObserver().fire(el, 1);
    service.unobserve('a');
    expect(service.isVisible('a')).toBeFalse();
    expect(lastObserver().observed).not.toContain(el);
  });

  it('should observe multiple elements under one id (multi-video panel)', () => {
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    service.observe('a', el1);
    service.observe('a', el2);
    // Both elements are observed (no eviction) — identity checks because
    // jasmine's toContain treats two empty <div>s as structurally equal.
    expect(lastObserver().observed.includes(el1)).toBeTrue();
    expect(lastObserver().observed.includes(el2)).toBeTrue();
  });

  it('is visible while ANY element of the id meets the threshold', () => {
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    service.observe('a', el1);
    service.observe('a', el2);

    // First element becomes visible → one transition to visible.
    lastObserver().fire(el1, 0.8);
    expect(changes).toEqual([{ id: 'a', visible: true }]);

    // Second element also visible → still visible, no duplicate emit.
    lastObserver().fire(el2, 0.9);
    expect(changes.length).toBe(1);

    // One leaves → the other keeps the id visible, no transition.
    lastObserver().fire(el1, 0.1);
    expect(changes.length).toBe(1);
    expect(service.isVisible('a')).toBeTrue();

    // Last visible element leaves → transition to hidden.
    lastObserver().fire(el2, 0.1);
    expect(changes).toEqual([
      { id: 'a', visible: true },
      { id: 'a', visible: false },
    ]);
  });

  it('unobserveElement removes one element and does not freeze the id', () => {
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    service.observe('a', el1);
    service.observe('a', el2);
    lastObserver().fire(el2, 1);
    expect(service.isVisible('a')).toBeTrue();

    // Remove the visible element; el1 remains observed and drives the id.
    service.unobserveElement(el2);
    expect(lastObserver().observed.includes(el2)).toBeFalse();
    expect(lastObserver().observed.includes(el1)).toBeTrue();
    // Aggregate recomputed to hidden (el1 was never visible).
    expect(service.isVisible('a')).toBeFalse();

    // el1 can still turn the id visible after its sibling was removed.
    lastObserver().fire(el1, 1);
    expect(service.isVisible('a')).toBeTrue();
  });

  it('moves an element when re-observed under a new id', () => {
    const el = document.createElement('div');
    service.observe('a', el);
    lastObserver().fire(el, 1);
    expect(service.isVisible('a')).toBeTrue();

    service.observe('b', el);
    // No longer contributes to 'a'; now drives 'b'.
    expect(service.isVisible('a')).toBeFalse();
    lastObserver().fire(el, 1);
    expect(service.isVisible('b')).toBeTrue();
  });

  it('should clear all observation state', () => {
    const el = document.createElement('div');
    service.observe('a', el);
    lastObserver().fire(el, 1);
    service.clear();
    expect(service.isVisible('a')).toBeFalse();
    expect(lastObserver().observed).toEqual([]);
  });
});
