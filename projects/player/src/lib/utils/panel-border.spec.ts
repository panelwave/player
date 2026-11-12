// SYNCED FROM panelwave-cms/apps/cms-frontend/src/app/core/utils/panel-border.spec.ts — DO NOT EDIT HERE.
// Edit the CMS copy, then run in panelwave-cms: npm run sync:balloon

import {
  DEFAULT_PANEL_BORDER,
  formatFramePx,
  pageScaleOnScreen,
  panelBorderClipPath,
  panelBorderHasLine,
  panelBorderSeed,
  panelBorderShape,
  resolvePanelBorder,
  type ResolvedPanelBorder,
} from './panel-border';

const border = (patch: Partial<ResolvedPanelBorder> = {}): ResolvedPanelBorder => ({ ...DEFAULT_PANEL_BORDER, ...patch });

describe('panel-border', () => {
  describe('resolvePanelBorder', () => {
    it('uses the format default without work or panel settings', () => {
      expect(resolvePanelBorder(undefined, undefined)).toEqual({ color: '#000000', thickness: 2, style: 'solid', radius: 0 });
      expect(resolvePanelBorder(null, 'nonsense')).toEqual(DEFAULT_PANEL_BORDER);
    });

    it('lets the panel override the work field by field', () => {
      const work = { color: '#999999', thickness: 1, style: 'solid', radius: 8 };
      expect(resolvePanelBorder(work, { style: 'dashed' })).toEqual({ color: '#999999', thickness: 1, style: 'dashed', radius: 8 });
      expect(resolvePanelBorder(work, { thickness: 0 })).toEqual({ color: '#999999', thickness: 0, style: 'solid', radius: 8 });
    });

    it('treats empty and invalid values as unset', () => {
      const work = { color: '#123456', thickness: 3, style: 'double', radius: 4 };
      expect(resolvePanelBorder(work, { color: '', thickness: '', style: '', radius: '' })).toEqual({
        color: '#123456',
        thickness: 3,
        style: 'double',
        radius: 4,
      });
      expect(resolvePanelBorder({ color: 'red', thickness: 'thick', radius: null }, {})).toEqual(DEFAULT_PANEL_BORDER);
    });

    it('accepts numeric strings and clamps the ranges', () => {
      expect(resolvePanelBorder({ thickness: '4', radius: '12' }).thickness).toBe(4);
      expect(resolvePanelBorder({ thickness: 25 }).thickness).toBe(10);
      expect(resolvePanelBorder({ thickness: -1 }).thickness).toBe(0);
      expect(resolvePanelBorder({ radius: 999 }).radius).toBe(200);
    });

    it('draws an unknown style as solid', () => {
      expect(resolvePanelBorder({ style: 'zigzag' }).style).toBe('solid');
    });

    it('knows when there is no line', () => {
      expect(panelBorderHasLine(border())).toBeTrue();
      expect(panelBorderHasLine(border({ thickness: 0 }))).toBeFalse();
      expect(panelBorderHasLine(border({ style: 'none' }))).toBeFalse();
    });
  });

  describe('formatFramePx / pageScaleOnScreen', () => {
    it('knows the authoring size of every format', () => {
      expect(formatFramePx('a4-portrait')).toEqual({ width: 794, height: 1123 });
      expect(formatFramePx('bigscreen-landscape')).toEqual({ width: 3840, height: 2160 });
      expect(formatFramePx('mobile-portrait')).toEqual({ width: 375, height: 667 });
    });

    it('falls back to the canvas size, then the aspect, then A4', () => {
      expect(formatFramePx('custom', { width: 1000, height: 500 })).toEqual({ width: 1000, height: 500 });
      expect(formatFramePx('custom', null, 2)).toEqual({ width: 2246, height: 1123 });
      expect(formatFramePx(null)).toEqual({ width: 794, height: 1123 });
    });

    it('scales a page into a screen box by its tighter side', () => {
      expect(pageScaleOnScreen({ width: 794, height: 1123 }, 1920, 1080)).toBeCloseTo(1080 / 1123, 6);
      expect(pageScaleOnScreen({ width: 794, height: 1123 }, 397, 2000)).toBeCloseTo(0.5, 6);
      expect(pageScaleOnScreen({ width: 794, height: 1123 }, 0, 100)).toBe(1);
    });
  });

  describe('panelBorderShape', () => {
    it('draws nothing (and clips nothing) without a line or a radius', () => {
      expect(panelBorderShape(border({ thickness: 0 }), 300, 200)).toEqual({ strokes: [], clip: { kind: 'none' } });
      expect(panelBorderShape(border({ style: 'none' }), 300, 200).strokes).toEqual([]);
      expect(panelBorderShape(border(), 0, 200).strokes).toEqual([]);
    });

    it('keeps the corner radius of a borderless panel', () => {
      expect(panelBorderShape(border({ thickness: 0, radius: 16 }), 300, 200)).toEqual({
        strokes: [],
        clip: { kind: 'round', radius: 16 },
      });
    });

    it('insets a solid line by half its thickness, inside the frame', () => {
      const shape = panelBorderShape(border({ thickness: 4 }), 300, 200);
      expect(shape.clip).toEqual({ kind: 'none' });
      expect(shape.strokes).toEqual([{ d: 'M2 2H298V198H2Z', width: 4, dash: null, cap: 'butt', join: 'miter' }]);
    });

    it('rounds the line with the radius minus the inset and clips the corners', () => {
      const shape = panelBorderShape(border({ thickness: 4, radius: 20 }), 300, 200);
      expect(shape.clip).toEqual({ kind: 'round', radius: 20 });
      expect(shape.strokes[0].d).toBe('M20 2H280A18 18 0 0 1 298 20V180A18 18 0 0 1 280 198H20A18 18 0 0 1 2 180V20A18 18 0 0 1 20 2Z');
    });

    it('dashes and dots relative to the thickness', () => {
      expect(panelBorderShape(border({ style: 'dashed', thickness: 2 }), 300, 200).strokes[0]).toEqual(
        jasmine.objectContaining({ dash: [6, 4], cap: 'butt' }),
      );
      expect(panelBorderShape(border({ style: 'dotted', thickness: 3 }), 300, 200).strokes[0]).toEqual(
        jasmine.objectContaining({ dash: [0, 6], cap: 'round' }),
      );
    });

    it('draws double as two lines of the thickness a thickness apart', () => {
      const strokes = panelBorderShape(border({ style: 'double', thickness: 2 }), 300, 200).strokes;
      expect(strokes.map((s) => [s.d, s.width])).toEqual([
        ['M1 1H299V199H1Z', 2],
        ['M5 5H295V195H5Z', 2],
      ]);
    });

    it('falls back to one line when a double line does not fit', () => {
      expect(panelBorderShape(border({ style: 'double', thickness: 10 }), 50, 50).strokes.length).toBe(1);
    });

    for (const style of ['rough', 'wavy'] as const) {
      it(`${style}: strokes the outline twice as thick and clips to it, inside the frame`, () => {
        const shape = panelBorderShape(border({ style, thickness: 2 }), 400, 240, 'p5');
        expect(shape.strokes.length).toBe(1);
        expect(shape.strokes[0].width).toBe(4);
        expect(shape.strokes[0].join).toBe('round');
        expect(shape.clip.kind).toBe('polygon');
        const points = shape.clip.kind === 'polygon' ? shape.clip.points : [];
        expect(points.length).toBeGreaterThan(40);
        for (const [x, y] of points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(400);
          expect(y).toBeLessThanOrEqual(240);
        }
      });
    }

    it('rough is stable per seed and differs between panels', () => {
      const a1 = panelBorderShape(border({ style: 'rough' }), 400, 240, 'p5').strokes[0].d;
      const a2 = panelBorderShape(border({ style: 'rough' }), 400, 240, 'p5').strokes[0].d;
      const b = panelBorderShape(border({ style: 'rough' }), 400, 240, 'p6').strokes[0].d;
      expect(a1).toBe(a2);
      expect(a1).not.toBe(b);
      expect(panelBorderSeed('p5')).toBe(panelBorderSeed('p5'));
    });

    it('wavy reaches the frame edge with its crests', () => {
      const shape = panelBorderShape(border({ style: 'wavy', thickness: 2 }), 400, 240);
      const points = shape.clip.kind === 'polygon' ? shape.clip.points : [];
      const minY = Math.min(...points.map(([, y]) => y));
      expect(minY).toBeLessThan(0.5);
    });

    it('caps the outline samples on very large frames', () => {
      const shape = panelBorderShape(border({ style: 'wavy', thickness: 1 }), 3840, 2160);
      const points = shape.clip.kind === 'polygon' ? shape.clip.points : [];
      expect(points.length).toBeLessThan(1700);
    });
  });

  describe('panelBorderClipPath', () => {
    it('writes rounded corners as an inset in percent of each side', () => {
      expect(panelBorderClipPath({ kind: 'round', radius: 20 }, 400, 200)).toBe('inset(0 round 5% / 10%)');
    });

    it('writes an outline as a percent polygon', () => {
      expect(panelBorderClipPath({ kind: 'polygon', points: [[0, 0], [200, 50], [400, 200]] }, 400, 200)).toBe(
        'polygon(0% 0%,50% 25%,100% 100%)',
      );
    });

    it('needs no clip for a straight frame', () => {
      expect(panelBorderClipPath({ kind: 'none' }, 400, 200)).toBeNull();
      expect(panelBorderClipPath({ kind: 'round', radius: 4 }, 0, 200)).toBeNull();
    });
  });
});
