import { NO_FOCUS_TRANSFORM, focusTransform, pickFocusRect } from './focus-rect-utils';

describe('focus-rect-utils', () => {
  describe('pickFocusRect', () => {
    const mobile = { x: 0.6, y: 0.1, w: 0.3, h: 0.8 };
    const desktop = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

    it('returns null without format views or focus rects', () => {
      expect(pickFocusRect(undefined, 400, 800)).toBeNull();
      expect(pickFocusRect({}, 400, 800)).toBeNull();
      expect(pickFocusRect({ 'mobile-portrait': { allowPanelView: true } }, 400, 800)).toBeNull();
      expect(pickFocusRect({ 'mobile-portrait': { minimalFocusRect: mobile } }, 0, 800)).toBeNull();
    });

    it('picks the format whose frame is closest to the screen shape', () => {
      const views = {
        'mobile-portrait': { minimalFocusRect: mobile },
        'desktop-landscape': { minimalFocusRect: desktop },
      };
      expect(pickFocusRect(views, 393, 852)).toEqual(mobile);   // phone
      expect(pickFocusRect(views, 1920, 1080)).toEqual(desktop); // desktop
      expect(pickFocusRect(views, 820, 1180)).toEqual(mobile);   // tablet portrait: nearer to the phone
    });

    it('uses the only rect a panel defines, whatever the screen', () => {
      expect(pickFocusRect({ 'mobile-portrait': { minimalFocusRect: mobile } }, 1920, 1080)).toEqual(mobile);
    });

    it('ignores empty or non-finite rects and clamps rects to the panel', () => {
      expect(pickFocusRect({ 'mobile-portrait': { minimalFocusRect: { x: 0, y: 0, w: 0, h: 1 } } }, 400, 800)).toBeNull();
      expect(pickFocusRect({ 'mobile-portrait': { minimalFocusRect: { x: Number.NaN, y: 0, w: 1, h: 1 } } }, 400, 800)).toBeNull();
      expect(pickFocusRect({ 'mobile-portrait': { minimalFocusRect: { x: 0.8, y: 0, w: 0.5, h: 1 } } }, 400, 800))
        .toEqual({ x: 0.8, y: 0, w: jasmine.any(Number) as unknown as number, h: 1 });
    });

    it('considers formats it does not know last', () => {
      const views = {
        'x-custom': { minimalFocusRect: desktop },
        'mobile-portrait': { minimalFocusRect: mobile },
      };
      expect(pickFocusRect(views, 1920, 1080)).toEqual(mobile);
      expect(pickFocusRect({ 'x-custom': { minimalFocusRect: desktop } }, 1920, 1080)).toEqual(desktop);
    });
  });

  describe('focusTransform', () => {
    // A 1280×720 landscape panel on a 400×800 phone: 440 px hidden on each side.
    const P = [1280, 720, 400, 800] as const;

    it('is the identity without a rect, or when the panel fits the viewport', () => {
      expect(focusTransform(...P, null)).toBe(NO_FOCUS_TRANSFORM);
      expect(focusTransform(1280, 720, 1920, 1080, { x: 0.7, y: 0, w: 0.2, h: 1 })).toBe(NO_FOCUS_TRANSFORM);
      expect(focusTransform(0, 720, 400, 800, { x: 0, y: 0, w: 1, h: 1 })).toBe(NO_FOCUS_TRANSFORM);
    });

    it('centers the crop on the focus rect', () => {
      // Rect center at 75 % of the width: 0.25 × 1280 = 320 px right of the middle.
      expect(focusTransform(...P, { x: 0.65, y: 0.1, w: 0.2, h: 0.8 })).toEqual({ offsetX: -320, offsetY: 0, scale: 1 });
      // ... and to the left.
      expect(focusTransform(...P, { x: 0.15, y: 0.1, w: 0.2, h: 0.8 })).toEqual({ offsetX: 320, offsetY: 0, scale: 1 });
    });

    it('never shifts the panel past its own edge', () => {
      // Rect hugging the right edge: the panel stops flush with the viewport (max shift 440).
      expect(focusTransform(...P, { x: 0.9, y: 0, w: 0.1, h: 1 })).toEqual({ offsetX: -440, offsetY: 0, scale: 1 });
      expect(focusTransform(...P, { x: 0, y: 0, w: 0.1, h: 1 })).toEqual({ offsetX: 440, offsetY: 0, scale: 1 });
    });

    it('keeps an axis centered when the panel already fits in it', () => {
      // The panel is 720 px tall in an 800 px viewport: no vertical shift, whatever the rect.
      expect(focusTransform(...P, { x: 0.4, y: 0.7, w: 0.2, h: 0.2 }).offsetY).toBe(0);
    });

    it('shrinks the panel just enough for a focus rect wider than the screen', () => {
      // Rect 50 % wide = 640 px > 400 px: scale 0.625, the panel becomes 800×450 and the rect fills the width.
      const t = focusTransform(...P, { x: 0.25, y: 0, w: 0.5, h: 1 });
      expect(t.scale).toBe(0.625);
      expect(t.offsetX).toBe(0);
      const right = focusTransform(...P, { x: 0.5, y: 0, w: 0.5, h: 1 });
      expect(right.scale).toBe(0.625);
      expect(right.offsetX).toBe(-200); // rect center at 75 % of 800 px
    });

    it('handles a portrait panel on a landscape screen (vertical crop)', () => {
      const t = focusTransform(720, 1280, 800, 400, { x: 0, y: 0.7, w: 1, h: 0.2 });
      expect(t).toEqual({ offsetX: 0, offsetY: -384, scale: 1 });
    });
  });
});
