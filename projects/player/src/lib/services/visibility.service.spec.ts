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

  it('should replace the element when re-observing the same id', () => {
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    service.observe('a', el1);
    service.observe('a', el2);
    // Identity checks — jasmine's toContain would treat two empty <div>s
    // as structurally equal.
    expect(lastObserver().observed.includes(el1)).toBeFalse();
    expect(lastObserver().observed.includes(el2)).toBeTrue();
    // Events from the new element map to the id.
    lastObserver().fire(el2, 1);
    expect(changes).toEqual([{ id: 'a', visible: true }]);
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
