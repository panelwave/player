import { framesBounds, isFramedPlacement, placementBoxStyle, placementCrop, placementFrame } from './placement-frame';
import type { PanelPlacement } from '../types';

describe('placement-frame (schema 1.13 framed placements)', () => {
  // Sample 18: a square frame at the page's left edge, zoom 2 into the right half of a 16:9 image
  const framed: PanelPlacement = {
    panelId: 'p1',
    x: -1.2778,
    y: -0.1468,
    w: 1.7778,
    h: 0.7071,
    vx: 0.71875,
    vy: 0.25,
    vw: 0.28125,
    vh: 0.5,
  };
  const plain: PanelPlacement = { panelId: 'p2', x: 0.05, y: 0.62, w: 0.9, h: 0.3579 };

  it('fills in the schema defaults and clamps the crop so the box always covers the frame', () => {
    expect(placementCrop(plain)).toEqual({ vx: 0, vy: 0, vw: 1, vh: 1 });
    expect(placementCrop({ vx: 0.9, vw: 0.5 })).toEqual({ vx: 0.5, vy: 0, vw: 0.5, vh: 1 });
    expect(placementCrop({ vw: 0, vh: 2 })).toEqual({ vx: 0, vy: 0, vw: 0.001, vh: 1 });
  });

  it('tells framed placements from plain ones', () => {
    expect(isFramedPlacement(framed)).toBeTrue();
    expect(isFramedPlacement(plain)).toBeFalse();
    expect(isFramedPlacement({ vx: 0, vy: 0, vw: 1, vh: 1 })).toBeFalse();
  });

  it('places the frame where the page shows it, even when the box starts left of the page', () => {
    const f = placementFrame(framed);
    expect(f.x).toBeCloseTo(0, 3);
    expect(f.y).toBeCloseTo(0.03, 3);
    expect(f.w).toBeCloseTo(0.5, 3);
    expect(f.h).toBeCloseTo(0.3535, 3);
    expect(placementFrame(plain)).toEqual({ x: 0.05, y: 0.62, w: 0.9, h: 0.3579 });
  });

  it('sizes the box in percent of its frame (1 / vw wide, shifted by vx / vw)', () => {
    expect(placementBoxStyle(framed)).toEqual({ left: '-255.556%', top: '-50%', width: '355.556%', height: '200%' });
    expect(placementBoxStyle(plain)).toEqual({ left: '0%', top: '0%', width: '100%', height: '100%' });
  });

  it('bounds the frames, not the boxes, clamped to the page', () => {
    expect(framesBounds([])).toBeNull();
    const b = framesBounds([framed, plain])!;
    expect(b.x).toBeCloseTo(0, 3);
    expect(b.y).toBeCloseTo(0.03, 3);
    expect(b.w).toBeCloseTo(0.95, 3);
    expect(b.h).toBeCloseTo(0.9479, 3);
  });
});
