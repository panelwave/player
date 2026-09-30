import {
  FULL_VIEWPORT_RECT,
  cameraMoveRects,
  cameraTransformCss,
  hasCameraMove,
  normalizeViewportRect,
  panelAnimationPlayTime,
  sampleViewportRect,
  viewportRectTransform,
} from './camera-move';

describe('camera-move', () => {
  describe('normalizeViewportRect', () => {
    it('keeps a valid rect', () => {
      expect(normalizeViewportRect({ x: 0.3, y: 0.2, w: 0.4, h: 0.4 })).toEqual({ x: 0.3, y: 0.2, w: 0.4, h: 0.4 });
    });

    it('clamps a rect that leaves the panel back into it', () => {
      expect(normalizeViewportRect({ x: 0.8, y: -0.2, w: 0.5, h: 2 })).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
    });

    it('rejects missing, non-numeric and empty rects', () => {
      expect(normalizeViewportRect(undefined)).toBeNull();
      expect(normalizeViewportRect(null)).toBeNull();
      expect(normalizeViewportRect({ x: 0, y: 0, w: 0, h: 1 })).toBeNull();
      expect(normalizeViewportRect({ x: 0, y: 0, w: 1, h: -1 })).toBeNull();
      expect(normalizeViewportRect({ x: NaN, y: 0, w: 1, h: 1 })).toBeNull();
      expect(normalizeViewportRect({ x: '0', y: 0, w: 1, h: 1 } as never)).toBeNull();
    });
  });

  describe('cameraMoveRects / hasCameraMove', () => {
    const zoom = { x: 0.3, y: 0.2, w: 0.4, h: 0.4 };

    it('returns both rects of a move', () => {
      expect(cameraMoveRects({ startViewportRect: FULL_VIEWPORT_RECT, endViewportRect: zoom })).toEqual({
        start: { x: 0, y: 0, w: 1, h: 1 },
        end: zoom,
      });
    });

    it('treats a missing rect as the whole panel', () => {
      expect(cameraMoveRects({ endViewportRect: zoom })).toEqual({ start: { x: 0, y: 0, w: 1, h: 1 }, end: zoom });
      expect(cameraMoveRects({ startViewportRect: zoom })).toEqual({ start: zoom, end: { x: 0, y: 0, w: 1, h: 1 } });
    });

    it('has no move without rects, with malformed rects, or from the whole panel to the whole panel', () => {
      expect(hasCameraMove(undefined)).toBeFalse();
      expect(hasCameraMove({ durationMs: 1000 })).toBeFalse();
      expect(hasCameraMove({ startViewportRect: { x: 0, y: 0, w: 0, h: 0 } })).toBeFalse();
      expect(hasCameraMove({ startViewportRect: { x: 0, y: 0, w: 1, h: 1 }, endViewportRect: { x: 0, y: 0, w: 1, h: 1 } })).toBeFalse();
      expect(hasCameraMove({ endViewportRect: zoom })).toBeTrue();
    });

    it('a static framing (start = end) is a move too: the panel is shown zoomed', () => {
      expect(hasCameraMove({ startViewportRect: zoom, endViewportRect: zoom })).toBeTrue();
    });
  });

  describe('sampleViewportRect', () => {
    const start = { x: 0, y: 0, w: 1, h: 1 };
    const end = { x: 0.4, y: 0.2, w: 0.5, h: 0.5 };

    it('holds the start rect at 0 and the end rect from the duration on', () => {
      expect(sampleViewportRect(start, end, 0, 2000)).toEqual(start);
      expect(sampleViewportRect(start, end, -5, 2000)).toEqual(start);
      expect(sampleViewportRect(start, end, 2000, 2000)).toEqual(end);
      expect(sampleViewportRect(start, end, 9999, 2000)).toEqual(end);
    });

    it('interpolates linearly by default', () => {
      const mid = sampleViewportRect(start, end, 1000, 2000);
      expect(mid.x).toBeCloseTo(0.2, 6);
      expect(mid.y).toBeCloseTo(0.1, 6);
      expect(mid.w).toBeCloseTo(0.75, 6);
      expect(mid.h).toBeCloseTo(0.75, 6);
    });

    it('applies the easing', () => {
      const eased = sampleViewportRect(start, end, 500, 2000, 'ease-in');
      const linear = sampleViewportRect(start, end, 500, 2000, 'linear');
      expect(eased.x).toBeLessThan(linear.x); // ease-in starts slowly
    });

    it('applies the end rect when there is no duration', () => {
      expect(sampleViewportRect(start, end, 0, 0)).toEqual(end);
    });
  });

  describe('viewportRectTransform', () => {
    it('is the identity for the whole panel', () => {
      expect(viewportRectTransform({ x: 0, y: 0, w: 1, h: 1 }, 1280, 720)).toEqual({ x: 0, y: 0, scale: 1 });
    });

    it('zooms into a centered rect of the same shape', () => {
      // Middle half: scale 2, the rect's centre (640, 360) stays in the middle.
      expect(viewportRectTransform({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 1280, 720)).toEqual({ x: -640, y: -360, scale: 2 });
    });

    it('fits the rect uniformly (never stretches) and centres the shorter side', () => {
      // A wide strip: scale limited by the width (1 / 0.5 = 2), not the height (1 / 0.2 = 5).
      const t = viewportRectTransform({ x: 0.25, y: 0.4, w: 0.5, h: 0.2 }, 1000, 500);
      expect(t.scale).toBe(2);
      expect(t.x).toBe(-500);
      // Strip centre y = 0.5 * 500 = 250 -> 250 - 250 * 2 = -250.
      expect(t.y).toBe(-250);
    });

    it('never uncovers the panel box near an edge', () => {
      // Top-left corner strip: centering would pull the content right/down of the box.
      const t = viewportRectTransform({ x: 0, y: 0, w: 0.5, h: 0.2 }, 1000, 500);
      expect(t.scale).toBe(2);
      expect(t.x).toBe(0);
      expect(t.y).toBe(0);
      // Bottom-right corner strip.
      const b = viewportRectTransform({ x: 0.5, y: 0.8, w: 0.5, h: 0.2 }, 1000, 500);
      expect(b.x).toBe(-1000);
      expect(b.y).toBe(-500);
    });

    it('returns the identity for an unmeasured box', () => {
      expect(viewportRectTransform({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 0, 0)).toEqual({ x: 0, y: 0, scale: 1 });
    });
  });

  describe('cameraTransformCss', () => {
    it('formats a transform and leaves the identity out', () => {
      expect(cameraTransformCss({ x: -640, y: -360, scale: 2 })).toBe('translate(-640px, -360px) scale(2)');
      expect(cameraTransformCss({ x: 0, y: 0, scale: 1 })).toBeNull();
      expect(cameraTransformCss({ x: -12.3456, y: 0, scale: 1.123456 })).toBe('translate(-12.35px, 0px) scale(1.1235)');
    });
  });
});

describe('panelAnimationPlayTime', () => {
  const kf = [
    { layerId: 'l1', property: 'opacity' as const, timeMs: 0, value: 0 },
    { layerId: 'l1', property: 'opacity' as const, timeMs: 1500, value: 1 },
  ];

  it('is the running time of a non-looping animation', () => {
    expect(panelAnimationPlayTime({ durationMs: 4000, keyframes: kf })).toBe(4000);
    expect(panelAnimationPlayTime({ keyframes: kf })).toBe(1500); // no durationMs: last keyframe
    expect(panelAnimationPlayTime({ durationMs: 2500, endViewportRect: { x: 0, y: 0, w: 0.5, h: 0.5 } })).toBe(2500);
  });

  it('is 0 when there is nothing to wait for', () => {
    expect(panelAnimationPlayTime(undefined)).toBe(0);
    expect(panelAnimationPlayTime({ durationMs: 4000 })).toBe(0); // nothing animated
    expect(panelAnimationPlayTime({ durationMs: 4000, loop: true, keyframes: kf })).toBe(0); // never ends
  });
});
