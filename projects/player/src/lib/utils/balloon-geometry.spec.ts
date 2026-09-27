import {
  BalloonCenterBounds,
  squircleEdgePoint,
  tailConfigToTip,
  tailTipToTailConfig,
  thoughtTrailCircles,
} from './balloon-geometry';

describe('balloon-geometry', () => {
  const bounds: BalloonCenterBounds = { cx: 200, cy: 100, width: 120, height: 80 };
  const cornerRadius = 0.5;

  describe('squircleEdgePoint', () => {
    it('position 0 (top) is directly above the center on the edge', () => {
      const p = squircleEdgePoint(bounds, 0, cornerRadius);
      expect(p.x).toBeCloseTo(200, 0);
      expect(p.y).toBeCloseTo(100 - 40, 0); // cy - height/2
    });

    it('position 90 (right) is directly right of the center on the edge', () => {
      const p = squircleEdgePoint(bounds, 90, cornerRadius);
      expect(p.x).toBeCloseTo(200 + 60, 0); // cx + width/2
      expect(p.y).toBeCloseTo(100, 0);
    });

    it('position 180 (bottom) is directly below the center on the edge', () => {
      const p = squircleEdgePoint(bounds, 180, cornerRadius);
      expect(p.x).toBeCloseTo(200, 0);
      expect(p.y).toBeCloseTo(100 + 40, 0);
    });
  });

  describe('tailConfigToTip', () => {
    it('places the tip `length` px beyond the edge along the tail direction', () => {
      const tip = tailConfigToTip(bounds, { position: 180, length: 45 }, cornerRadius);
      expect(tip.x).toBeCloseTo(200, 0);
      expect(tip.y).toBeCloseTo(100 + 40 + 45, 0);
    });
  });

  describe('tailTipToTailConfig', () => {
    it('is the inverse of tailConfigToTip (round-trip)', () => {
      for (const position of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const tip = tailConfigToTip(bounds, { position, length: 50 }, cornerRadius);
        const back = tailTipToTailConfig(bounds, tip.x, tip.y, cornerRadius);
        expect(back.position).toBeCloseTo(position, -1); // within ~5°
        expect(back.length).toBeCloseTo(50, -1);         // within ~5px
      }
    });

    it('a tip below the center maps to position 180', () => {
      const cfg = tailTipToTailConfig(bounds, 200, 220, cornerRadius);
      expect(cfg.position).toBe(180);
      expect(cfg.length).toBeCloseTo(220 - 140, 0);
    });

    it('clamps length to 0 when the tip is inside the balloon', () => {
      const cfg = tailTipToTailConfig(bounds, 200, 105, cornerRadius);
      expect(cfg.length).toBe(0);
    });
  });

  describe('thoughtTrailCircles', () => {
    it('returns three shrinking circles between the cloud edge and the tail tip', () => {
      // Tip straight below the center: edge point is (cx, cy + ry + 5) = (200, 145).
      const tip = { x: 200, y: 245 };
      const circles = thoughtTrailCircles(bounds, tip);

      expect(circles.length).toBe(3);
      expect(circles.map(c => c.r)).toEqual([8, 5, 3]);

      // All on the vertical line toward the tip, ordered edge -> tip,
      // with the last circle exactly at the tip (adjustedT = 1).
      for (const c of circles) expect(c.x).toBeCloseTo(200, 5);
      expect(circles[0].y).toBeGreaterThan(145);
      expect(circles[1].y).toBeGreaterThan(circles[0].y);
      expect(circles[2].y).toBeGreaterThan(circles[1].y);
      expect(circles[2].y).toBeCloseTo(245, 5);
    });

    it('follows the direction of the tail tip (horizontal case)', () => {
      const tip = { x: 320, y: 100 }; // straight right; edge at cx + rx + 5 = 265
      const circles = thoughtTrailCircles(bounds, tip);
      for (const c of circles) expect(c.y).toBeCloseTo(100, 5);
      expect(circles[0].x).toBeGreaterThan(265);
      expect(circles[2].x).toBeCloseTo(320, 5);
    });
  });
});
