import { START_VISIBLE_RATIO, isPanelShown, observePanelShown } from './panel-visibility';

const entry = (o: { isIntersecting: boolean; ratio: number; w: number; h: number; root?: { w: number; h: number } | null }) => ({
  isIntersecting: o.isIntersecting,
  intersectionRatio: o.ratio,
  intersectionRect: { width: o.w, height: o.h } as DOMRectReadOnly,
  rootBounds: o.root === null ? null : ({ width: o.root?.w ?? 1000, height: o.root?.h ?? 800 } as DOMRectReadOnly),
});

describe('panel-visibility', () => {
  it('a quarter of the panel visible counts as shown', () => {
    expect(START_VISIBLE_RATIO).toBe(0.25);
    expect(isPanelShown(entry({ isIntersecting: true, ratio: 0.25, w: 100, h: 100 }))).toBeTrue();
    expect(isPanelShown(entry({ isIntersecting: true, ratio: 0.2, w: 100, h: 100 }))).toBeFalse();
  });

  it('an oversized panel counts as shown when it covers a quarter of the viewport', () => {
    // 10 % of a huge panel, but 500×400 of a 1000×800 viewport = 25 %
    expect(isPanelShown(entry({ isIntersecting: true, ratio: 0.1, w: 500, h: 400 }))).toBeTrue();
    expect(isPanelShown(entry({ isIntersecting: true, ratio: 0.1, w: 500, h: 400, root: null }))).toBeFalse();
  });

  it('a panel off screen is not shown', () => {
    expect(isPanelShown(entry({ isIntersecting: false, ratio: 0, w: 0, h: 0 }))).toBeFalse();
  });

  it('without IntersectionObserver the panel counts as shown right away', () => {
    const original = window.IntersectionObserver;
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = undefined;
    try {
      const seen: boolean[] = [];
      const stop = observePanelShown(document.createElement('div'), (shown) => seen.push(shown));
      expect(seen).toEqual([true]);
      stop();
    } finally {
      (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = original;
    }
  });

  it('reports observations and disconnects on stop', () => {
    const original = window.IntersectionObserver;
    let callback: IntersectionObserverCallback | null = null;
    let disconnected = false;
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) { callback = cb; }
      observe(): void { /* driven below */ }
      disconnect(): void { disconnected = true; }
    };
    try {
      const seen: boolean[] = [];
      const stop = observePanelShown(document.createElement('div'), (shown) => seen.push(shown));
      callback!([entry({ isIntersecting: true, ratio: 1, w: 100, h: 100 }) as IntersectionObserverEntry], {} as IntersectionObserver);
      callback!([entry({ isIntersecting: false, ratio: 0, w: 0, h: 0 }) as IntersectionObserverEntry], {} as IntersectionObserver);
      expect(seen).toEqual([true, false]);
      stop();
      expect(disconnected).toBeTrue();
    } finally {
      (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = original;
    }
  });
});
