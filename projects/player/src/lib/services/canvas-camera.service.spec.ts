import { CanvasCameraService } from './canvas-camera.service';
import type { CanvasLayout, CanvasPlacement } from '../types';

describe('CanvasCameraService', () => {
  let service: CanvasCameraService;

  const layout = (placements: Record<string, CanvasPlacement>, camera?: CanvasLayout['camera']): CanvasLayout => ({
    placements,
    camera,
  });

  beforeEach(() => {
    service = new CanvasCameraService();
  });

  describe('framing', () => {
    it('frames a placement with contain fit (zoom limited by the larger side)', () => {
      service.configure(layout({ p1: { x: 0, y: 0, w: 1000, h: 500 } }), 500, 500);
      const state = service.frameForPlacement({ x: 0, y: 0, w: 1000, h: 500 });
      expect(state.x).toBe(500);
      expect(state.y).toBe(250);
      // contain: 500/1000 = 0.5 beats 500/500 = 1
      expect(state.zoom).toBeCloseTo(0.5, 5);
    });

    it('respects enterFraming as a panel-relative sub-rect', () => {
      service.configure(layout({ p1: { x: 100, y: 200, w: 1000, h: 1000 } }), 500, 500);
      const state = service.frameForPlacement({
        x: 100,
        y: 200,
        w: 1000,
        h: 1000,
        enterFraming: { x: 0, y: 0, w: 1, h: 0.5 },
      });
      // Framed rect = (100, 200, 1000, 500) -> center (600, 450)
      expect(state.x).toBe(600);
      expect(state.y).toBe(450);
      expect(state.zoom).toBeCloseTo(0.5, 5);
    });

    it('uses the rotation-expanded bounding box for rotated placements', () => {
      const box = service.placementBoundingBox({ x: 0, y: 0, w: 100, h: 100, r: 45 });
      const expected = 100 * Math.SQRT2;
      expect(box.w).toBeCloseTo(expected, 3);
      expect(box.h).toBeCloseTo(expected, 3);
      // Center rotation keeps the center in place
      expect(box.x + box.w / 2).toBeCloseTo(50, 3);
      expect(box.y + box.h / 2).toBeCloseTo(50, 3);
    });
  });

  describe('bounds & clamping', () => {
    it('computes auto bounds as the union of placements plus margin', () => {
      const bounds = service.computeAutoBounds([
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 900, y: 1900, w: 100, h: 100 },
      ]);
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeLessThan(0);
      expect(bounds!.y).toBeLessThan(0);
      expect(bounds!.x + bounds!.w).toBeGreaterThan(1000);
      expect(bounds!.y + bounds!.h).toBeGreaterThan(2000);
    });

    it('clamps free-roam panning to the canvas bounds', () => {
      service.configure(layout({ p1: { x: 0, y: 0, w: 1000, h: 1000 } }), 500, 500);
      service.jumpTo({ x: 500, y: 500, zoom: 1 });
      // Try to pan far outside the bounds
      service.panBy(100000, 100000);
      const state = service.state;
      const rect = service.visibleWorldRect(state);
      // Visible rect stays inside the (margin-expanded) bounds
      expect(rect.x).toBeGreaterThanOrEqual(-300);
      expect(rect.y).toBeGreaterThanOrEqual(-300);
    });

    it('caps zoom-in at the readability ceiling', () => {
      service.configure(layout({ p1: { x: 0, y: 0, w: 1000, h: 1000 } }), 500, 500);
      service.jumpTo({ x: 500, y: 500, zoom: 1 });
      service.zoomAt(1000, 250, 250);
      expect(service.state.zoom).toBeLessThanOrEqual(4);
    });
  });

  describe('zoomAt', () => {
    it('keeps the world point under the cursor stationary', () => {
      service.configure(layout({ p1: { x: -10000, y: -10000, w: 20000, h: 20000 } }), 1000, 800);
      service.jumpTo({ x: 0, y: 0, zoom: 1 });

      // Cursor at screen (750, 400): world point = (0 + (750-500)/1, 0) = (250, 0)
      service.zoomAt(2, 750, 400);
      const s = service.state;
      const worldUnderCursor = {
        x: s.x + (750 - 500) / s.zoom,
        y: s.y + (400 - 400) / s.zoom,
      };
      expect(worldUnderCursor.x).toBeCloseTo(250, 3);
      expect(worldUnderCursor.y).toBeCloseTo(0, 3);
    });
  });

  describe('flyTo', () => {
    it('reaches the target state when the animation completes', async () => {
      service.configure(layout({ p1: { x: -10000, y: -10000, w: 40000, h: 40000 } }), 500, 500);
      service.jumpTo({ x: 0, y: 0, zoom: 1 });

      await service.flyTo({ x: 800, y: 600, zoom: 0.5 }, { durationMs: 40, zoomProfile: 'hold' });
      expect(service.state.x).toBeCloseTo(800, 3);
      expect(service.state.y).toBeCloseTo(600, 3);
      expect(service.state.zoom).toBeCloseTo(0.5, 5);
    });

    it('cancel stops the glide and resolves the pending promise', async () => {
      service.configure(layout({ p1: { x: -10000, y: -10000, w: 40000, h: 40000 } }), 500, 500);
      service.jumpTo({ x: 0, y: 0, zoom: 1 });

      const flight = service.flyTo({ x: 5000, y: 5000, zoom: 1 }, { durationMs: 5000 });
      service.cancel();
      await flight;
      // Cancelled mid-flight: nowhere near the target
      expect(Math.hypot(service.state.x - 5000, service.state.y - 5000)).toBeGreaterThan(1000);
      expect(service.isAnimating).toBeFalse();
    });

    it('jumps instantly when the duration is zero', async () => {
      service.configure(layout({ p1: { x: -10000, y: -10000, w: 40000, h: 40000 } }), 500, 500);
      await service.flyTo({ x: 100, y: 100, zoom: 2 }, { durationMs: 0 });
      expect(service.state.x).toBeCloseTo(100, 3);
      expect(service.state.zoom).toBeCloseTo(2, 5);
    });
  });

  describe('overview', () => {
    it('toggles out to the full bounds and back to the saved framing', async () => {
      service.configure(layout({ p1: { x: 0, y: 0, w: 4000, h: 4000 } }), 500, 500);
      service.jumpTo({ x: 200, y: 200, zoom: 1 });

      await service.toggleOverview(false);
      expect(service.isOverview).toBeTrue();
      expect(service.state.zoom).toBeLessThan(0.2);

      await service.toggleOverview(false);
      expect(service.isOverview).toBeFalse();
      expect(service.state.x).toBeCloseTo(200, 3);
      expect(service.state.zoom).toBeCloseTo(1, 5);
    });

    it('does nothing when the policy disables the overview', async () => {
      service.configure(
        layout({ p1: { x: 0, y: 0, w: 4000, h: 4000 } }, { overview: { enabled: false } }),
        500,
        500
      );
      service.jumpTo({ x: 200, y: 200, zoom: 1 });
      await service.toggleOverview(false);
      expect(service.isOverview).toBeFalse();
      expect(service.state.zoom).toBeCloseTo(1, 5);
    });
  });
});
