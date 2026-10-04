/**
 * Unit tests for the ComicBalloon SVG geometry engine
 */

import { ComicBalloon, createBalloon, type BalloonOptions, type TailOptions } from './comic-balloon';

interface Pt {
  x: number;
  y: number;
}

/** Extract the endpoints of every M / L command in a path string. */
const linePoints = (d: string): Pt[] =>
  [...d.matchAll(/[ML] (-?\d+\.\d+) (-?\d+\.\d+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));

/** Extract every Q command as [control, end]. */
const quadCommands = (d: string): { c: Pt; e: Pt }[] =>
  [...d.matchAll(/Q (-?\d+\.\d+) (-?\d+\.\d+) (-?\d+\.\d+) (-?\d+\.\d+)/g)].map((m) => ({
    c: { x: +m[1], y: +m[2] },
    e: { x: +m[3], y: +m[4] },
  }));

/** Extract endpoints of every C command. */
const cubicEnds = (d: string): Pt[] =>
  [...d.matchAll(/C (?:-?\d+\.\d+ ){4}(-?\d+\.\d+) (-?\d+\.\d+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));

const has = (d: string, p: Pt): boolean => d.includes(`${p.x.toFixed(2)} ${p.y.toFixed(2)}`);

describe('ComicBalloon', () => {
  let container: HTMLDivElement;
  const W = 140;
  const H = 80;

  const make = (opts: Partial<BalloonOptions> = {}): ComicBalloon =>
    new ComicBalloon(container, { maxWidth: W, maxHeight: H, ...opts });

  const paths = (): SVGPathElement[] => Array.from(container.querySelectorAll('path'));

  beforeEach(() => {
    container = document.createElement('div');
  });

  describe('constructor', () => {
    it('fills in defaults for every option', () => {
      const b = new ComicBalloon(container);
      expect(b.container).toBe(container);
      expect(b.options).toEqual({
        maxWidth: 140,
        maxHeight: 0,
        padding: { top: 14, right: 18, bottom: 14, left: 18 },
        strokeWidth: 2,
        strokeColor: '#000',
        fillColor: '#fff',
        textColor: '#000',
        tailWidth: 18,
        cornerRadius: 0.45,
        fontFamily: "'Ames Italic', 'Comic Neue', sans-serif",
        fontSize: 12,
        lineHeight: 1.3,
        textAlign: 'center',
        isThought: false,
        isShout: false,
        isWhisper: false,
        sharpCorners: false,
        cutTop: false,
        cutRight: false,
        cutLeft: false,
        openTail: false,
        hideBorder: null,
      });
    });

    it('keeps an explicit cornerRadius of 0 (nullish, not falsy, default)', () => {
      expect(new ComicBalloon(container, { cornerRadius: 0 }).options.cornerRadius).toBe(0);
    });

    it('resolves a CSS selector container', () => {
      const host = document.createElement('div');
      host.id = 'balloon-host-spec';
      document.body.appendChild(host);
      try {
        const b = new ComicBalloon('#balloon-host-spec');
        expect(b.container).toBe(host);
        b.render('Hi');
        expect(host.querySelector('svg.comic-balloon-svg')).not.toBeNull();
      } finally {
        host.remove();
      }
    });
  });

  describe('render (speech / default squircle)', () => {
    it('produces one filled+stroked closed path spanning the balloon box', () => {
      const res = make({ strokeColor: '#123', fillColor: '#abc', strokeWidth: 3 }).render('Hello');
      expect(res.width).toBe(W);
      expect(res.height).toBe(H);
      expect(res.svg.getAttribute('class')).toBe('comic-balloon-svg');
      expect(container.children.length).toBe(1);

      const [p] = paths();
      expect(paths().length).toBe(1);
      expect(p.getAttribute('fill')).toBe('#abc');
      expect(p.getAttribute('stroke')).toBe('#123');
      expect(p.getAttribute('stroke-width')).toBe('3');
      expect(p.getAttribute('stroke-linejoin')).toBe('round');
      expect(p.getAttribute('stroke-linecap')).toBe('round');
      expect(p.hasAttribute('stroke-dasharray')).toBeFalse();

      const d = p.getAttribute('d')!;
      expect(d.startsWith('M ')).toBeTrue();
      expect(d.endsWith(' Z')).toBeTrue();
      expect(d).not.toContain('Q');
      const pts = linePoints(d);
      expect(pts.length).toBeGreaterThan(100);
      expect(pts[0]).toEqual({ x: 0, y: 40 }); // sampling starts at angle -PI (left middle)
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      expect(Math.min(...xs)).toBeCloseTo(0, 1);
      expect(Math.max(...xs)).toBeCloseTo(W, 1);
      expect(Math.min(...ys)).toBeCloseTo(0, 1);
      expect(Math.max(...ys)).toBeCloseTo(H, 1);
    });

    it('sizes the viewBox with stroke + 5px padding when there is no tail', () => {
      const res = make().render('Hello');
      expect(res.svg.getAttribute('viewBox')).toBe('-7 -7 154 94');
      expect(res.svg.style.width).toBe('154px');
      expect(res.svg.style.height).toBe('94px');
      expect(res.svg.style.overflow).toBe('visible');
    });

    it('centres the text inside the balloon by layout and cleans up the measuring div', () => {
      const before = document.body.children.length;
      const res = make({ fontSize: 14, textAlign: 'left' }).render('Some <b>bold</b> words');
      expect(document.body.children.length).toBe(before);

      // The foreignObject spans the balloon body; a flex box centres the text.
      const fo = res.svg.querySelector('foreignObject')!;
      expect(+fo.getAttribute('x')!).toBe(0);
      expect(+fo.getAttribute('y')!).toBe(0);
      expect(+fo.getAttribute('width')!).toBe(W);
      expect(+fo.getAttribute('height')!).toBe(H);
      expect(fo.style.overflow).toBe('visible');

      const center = fo.firstElementChild as HTMLElement;
      expect(center.style.display).toBe('flex');
      expect(center.style.alignItems).toBe('center');
      expect(center.style.justifyContent).toBe('center');

      const div = center.firstElementChild as HTMLElement;
      expect(parseFloat(div.style.width)).toBeGreaterThan(0);
      expect(parseFloat(div.style.width)).toBeLessThanOrEqual(W - 28);
      expect(div.innerHTML).toBe('Some <b>bold</b> words');
      expect(div.style.fontSize).toBe('14px');
      expect(div.style.textAlign).toBe('left');
      expect(div.style.textTransform).toBe('uppercase');
      // wraps exactly like the measuring element
      expect(div.style.whiteSpace).toBe('pre-wrap');
    });

    it('renders the text vertically centred in a fixed-height balloon', () => {
      const res = make({ maxHeight: 200 }).render('Hi');
      const fo = res.svg.querySelector('foreignObject')!;
      const box = fo.getBoundingClientRect();
      const text = (fo.firstElementChild!.firstElementChild as HTMLElement).getBoundingClientRect();
      expect(text.top - box.top).toBeCloseTo(box.bottom - text.bottom, 0);
      expect(text.left - box.left).toBeCloseTo(box.right - text.right, 0);
    });

    it('derives natural width/height from text + padding when no max size is set', () => {
      const padding = { top: 5, right: 6, bottom: 7, left: 8 };
      // any non-positive width switches to natural sizing (-1 and 0 alike)
      for (const maxWidth of [-1, 0]) {
        const res = new ComicBalloon(container, { maxWidth, padding }).render('Hi');
        const fo = res.svg.querySelector('foreignObject')!;
        const textDiv = fo.querySelector('div > div') as HTMLElement;
        const textWidth = parseFloat(textDiv.style.width);
        expect(textWidth).toBeLessThanOrEqual(112);
        expect(res.width).toBe(textWidth + padding.left + padding.right);
        expect(+fo.getAttribute('width')!).toBe(res.width);
        expect(+fo.getAttribute('height')!).toBe(res.height);
      }
    });

    it('treats maxWidth 0 as natural width (like maxHeight 0), not as the 140 default', () => {
      const b = new ComicBalloon(container, { maxWidth: 0 });
      expect(b.options.maxWidth).toBe(0);
      const zero = b.render('Hi');
      // identical to the (already natural) negative-width path, i.e. text + padding,
      // instead of the fixed 140px box the old `|| 140` produced
      const natural = new ComicBalloon(container, { maxWidth: -1 }).render('Hi');
      expect(zero.width).toBe(natural.width);
      expect(zero.height).toBe(natural.height);
      const textDiv = zero.svg.querySelector('foreignObject div > div') as HTMLElement;
      expect(zero.width).toBe(parseFloat(textDiv.style.width) + 18 + 18);
      expect(zero.width).not.toBe(140);
    });

    it('falls back to the 140 default only for a missing / non-finite maxWidth', () => {
      expect(new ComicBalloon(container, {}).options.maxWidth).toBe(140);
      expect(new ComicBalloon(container, { maxWidth: undefined }).options.maxWidth).toBe(140);
      expect(new ComicBalloon(container, { maxWidth: NaN }).options.maxWidth).toBe(140);
      expect(new ComicBalloon(container, { maxWidth: 120 }).options.maxWidth).toBe(120);
    });

    it('re-rendering clears the previous SVG', () => {
      const b = make();
      b.render('One');
      b.render('Two');
      expect(container.querySelectorAll('svg').length).toBe(1);
      expect(container.querySelector('foreignObject div > div')!.innerHTML).toBe('Two');
    });
  });

  describe('tails', () => {
    it('routes the outline through an explicit x/y tail tip and grows the viewBox around it', () => {
      const res = make().render('Hi', { x: 70, y: 150 });
      const d = paths()[0].getAttribute('d')!;
      expect(d).toContain('L 70.00 150.00');
      // viewBox: left/top unchanged (-7), bottom = tip + 20
      expect(res.svg.getAttribute('viewBox')).toBe('-7 -7 154 177');
    });

    it('grows the viewBox to the left/top for tips outside that side', () => {
      const res = make().render('Hi', { x: -100, y: -50 });
      expect(res.svg.getAttribute('viewBox')).toBe('-120 -70 267 157');
      expect(paths()[0].getAttribute('d')).toContain('L -100.00 -50.00');
    });

    it('places a position-based tip on the superellipse edge plus the length', () => {
      make().render('Hi', { position: 180, length: 30 });
      expect(paths()[0].getAttribute('d')).toContain('L 70.00 110.00'); // bottom centre + 30

      make().render('Hi', { position: 90, length: 25 });
      expect(paths()[0].getAttribute('d')).toContain('L 165.00 40.00'); // right middle + 25
    });

    it('defaults the tail length to 50', () => {
      make().render('Hi', { position: 0 });
      expect(paths()[0].getAttribute('d')).toContain('L 70.00 -50.00'); // top centre - 50
    });

    it('places position 270 on the left edge', () => {
      make().render('Hi', { position: 270, length: 10 });
      expect(paths()[0].getAttribute('d')).toContain('-10.00 40.00'); // left middle - 10
    });

    it('keeps an explicit curveAmount of 0 (no bend) instead of the 0.4 default', () => {
      const b = make();
      b.render('Hi', { x: 70, y: 150, curve: 'left', curveAmount: 0 });
      expect(b.tailCurveAmount).toBe(0);
      const zero = paths()[0].getAttribute('d')!;
      make().render('Hi', { x: 70, y: 150, curve: 'left', curveAmount: 0.4 });
      expect(zero).not.toBe(paths()[0].getAttribute('d')!);
      // quadratic segments still used, but with zero offset: each control point is the
      // plain midpoint between its segment ends, i.e. the curve is geometrically straight
      const qs = quadCommands(zero);
      expect(qs.length).toBe(2);
      const tip = { x: 70, y: 150 };
      expect(qs[0].e.x).toBeCloseTo(tip.x, 1);
      expect(qs[0].e.y).toBeCloseTo(tip.y, 1);
      const q2 = qs[1];
      expect(q2.c.x).toBeCloseTo((tip.x + q2.e.x) / 2, 1);
      expect(q2.c.y).toBeCloseTo((tip.y + q2.e.y) / 2, 1);
    });

    it('still defaults a missing curveAmount to 0.4', () => {
      make().render('Hi', { x: 70, y: 150, curve: 'left' });
      const dflt = paths()[0].getAttribute('d');
      make().render('Hi', { x: 70, y: 150, curve: 'left', curveAmount: 0.4 });
      expect(dflt).toBe(paths()[0].getAttribute('d'));
    });

    it('createSquirclePath falls back to a straight tail when tailCurve is empty', () => {
      const b = make();
      b.tailCurve = '';
      const d = b.createSquirclePath(70, 40, W, H, 0.45, { x: 70, y: 150 }) as string;
      expect(d).not.toContain('Q');
      expect(d).toContain('L 70.00 150.00');
    });

    it('survives a degenerate zero-size balloon with a tail', () => {
      const d = make().createSquirclePath(0, 0, 0, 0, 0.45, { x: 0, y: 30 }) as string;
      expect(d).toBe('M 0.00 0.00 L 0.00 30.00 L 0.00 0.00 Z');
    });

    it('treats a tail option without a tip as no tip, but keeps curve settings', () => {
      const b = make();
      b.render('Hi', { curve: 'left', curveAmount: 0.9 });
      expect(b.tailCurve).toBe('left');
      expect(b.tailCurveAmount).toBe(0.9);
      const d = paths()[0].getAttribute('d')!;
      expect(d).not.toContain('Q');
      expect(b.options.maxWidth).toBe(W);
    });

    it('the straight tail connects base -> tip -> base with two line segments', () => {
      make().render('Hi', { x: 70, y: 150 });
      const pts = linePoints(paths()[0].getAttribute('d')!);
      const tipIdx = pts.findIndex((p) => p.x === 70 && p.y === 150);
      expect(tipIdx).toBeGreaterThan(0);
      const before = pts[tipIdx - 1];
      const after = pts[tipIdx + 1];
      // base points sit on the balloon's bottom edge, one on each side of the tip, ~8px from the centre point
      expect(before.y).toBeGreaterThan(75);
      expect(after.y).toBeGreaterThan(75);
      expect(Math.sign(before.x - 70)).toBe(-Math.sign(after.x - 70));
      // each base point is at least tailHalfWidth (8px) away from the centre sample
      expect(Math.abs(after.x - before.x)).toBeGreaterThanOrEqual(16);
      expect(Math.abs(after.x - before.x)).toBeLessThan(30);
      // symmetric sampling around the bottom -> symmetric base
      expect(before.x + after.x).toBeCloseTo(140, 1);
    });

    it('curved tails use quadratic segments that bend in opposite directions for left/right', () => {
      const tail: TailOptions = { x: 70, y: 150, curveAmount: 0.4 };
      make().render('Hi', { ...tail, curve: 'left' });
      const left = quadCommands(paths()[0].getAttribute('d')!);
      make().render('Hi', { ...tail, curve: 'right' });
      const right = quadCommands(paths()[0].getAttribute('d')!);

      expect(left.length).toBe(2);
      expect(right.length).toBe(2);
      expect(left[0].e).toEqual({ x: 70, y: 150 });
      expect(right[0].e).toEqual({ x: 70, y: 150 });

      // Offset magnitude = len * amount * 0.3 (len ~ 70 from base midpoint to tip)
      const spread = left[0].c.x - right[0].c.x;
      expect(spread).toBeGreaterThan(2 * 68 * 0.4 * 0.3);
      expect(spread).toBeLessThan(2 * 73 * 0.4 * 0.3);
      expect(left[0].c.y).toBeCloseTo(right[0].c.y, 0);

      make().render('Hi', { ...tail, curve: 'left', curveAmount: 0.8 });
      const stronger = quadCommands(paths()[0].getAttribute('d')!);
      expect(stronger[0].c.x - right[0].c.x).toBeGreaterThan(spread);
    });

    it('falls back to a straight tail when the tip is (almost) on the base midpoint', () => {
      make().render('Hi', { x: 70, y: 150 });
      const pts = linePoints(paths()[0].getAttribute('d')!);
      const tipIdx = pts.findIndex((p) => p.x === 70 && p.y === 150);
      const midY = (pts[tipIdx - 1].y + pts[tipIdx + 1].y) / 2;

      make().render('Hi', { x: 70, y: midY + 0.5, curve: 'right' });
      const d = paths()[0].getAttribute('d')!;
      expect(d).not.toContain('Q');
      expect(has(d, { x: 70, y: midY + 0.5 })).toBeTrue();
    });

    it('handles a tail on the left side where the base straddles the path start (wrap)', () => {
      make().render('Hi', { x: -60, y: 40 });
      const d = paths()[0].getAttribute('d')!;
      expect(d).toContain('L -60.00 40.00');
      expect(d.endsWith(' Z')).toBeTrue();
      const pts = linePoints(d);
      // wrap path starts right after the lower base index, never on the tip itself
      expect(pts[0]).not.toEqual({ x: -60, y: 40 });
      const tipIdx = pts.findIndex((p) => p.x === -60 && p.y === 40);
      expect(tipIdx).toBe(pts.length - 2);
    });

    it('curved wrap tails also use quadratic segments', () => {
      make().render('Hi', { x: -60, y: 40, curve: 'right' });
      const q = quadCommands(paths()[0].getAttribute('d')!);
      expect(q.length).toBe(2);
      expect(q[0].e).toEqual({ x: -60, y: 40 });
    });

    it('update helpers re-render with new text and/or tail', () => {
      const res = make().render('First', { x: 70, y: 150 });
      const textOf = (): string => container.querySelector('foreignObject div > div')!.innerHTML;
      const d = (): string => paths()[0].getAttribute('d')!;

      res.update();
      expect(textOf()).toBe('First');
      expect(d()).toContain('L 70.00 150.00');

      res.update('Second');
      expect(textOf()).toBe('Second');
      expect(d()).toContain('L 70.00 150.00');

      res.update(undefined, null);
      expect(d()).not.toContain('150.00');

      const r2 = res.updateTail({ x: 200, y: 40 });
      expect(textOf()).toBe('First');
      expect(d()).toContain('L 200.00 40.00');

      const r3 = r2.updateText('Third');
      expect(textOf()).toBe('Third');
      expect(d()).toContain('L 200.00 40.00');
      expect(r3.balloon).toBe(res.balloon);
    });
  });

  describe('open (connector) tails', () => {
    it('renders a closed fill path and an open stroke path ending in two parallel tail ends', () => {
      make({ openTail: true, fillColor: '#eee', strokeColor: '#111' }).render('Hi', { x: 70, y: 150 });
      const [fill, stroke] = paths();
      expect(paths().length).toBe(2);

      expect(fill.getAttribute('fill')).toBe('#eee');
      expect(fill.getAttribute('stroke')).toBe('none');
      expect(stroke.getAttribute('fill')).toBe('none');
      expect(stroke.getAttribute('stroke')).toBe('#111');

      const sd = stroke.getAttribute('d')!;
      const fd = fill.getAttribute('d')!;
      expect(fd).toBe(sd + ' Z');
      expect(sd.endsWith('Z')).toBeFalse();

      // tail axis is vertical -> ends are +-5px horizontally around the tip
      const pts = linePoints(sd);
      const ends = [pts[0], pts[pts.length - 1]].sort((a, b) => a.x - b.x);
      expect(ends).toEqual([
        { x: 65, y: 150 },
        { x: 75, y: 150 },
      ]);
      expect(sd).not.toContain('70.00 150.00');
    });

    it('supports open tails on the wrap side', () => {
      make({ openTail: true }).render('Hi', { x: -60, y: 40 });
      const sd = paths()[1].getAttribute('d')!;
      const pts = linePoints(sd);
      const ends = [pts[0], pts[pts.length - 1]].sort((a, b) => a.y - b.y);
      expect(ends).toEqual([
        { x: -60, y: 35 },
        { x: -60, y: 45 },
      ]);
      // the stroke still walks the whole balloon body, leaving only the tail gap open
      expect(pts.length).toBeGreaterThan(100);
    });

    it('never crosses the two connector lines (each end joins its nearer base point)', () => {
      for (const tip of [{ x: 200, y: 10 }, { x: 200, y: 70 }, { x: 10, y: 150 }, { x: 130, y: -60 }]) {
        make({ openTail: true }).render('Hi', tip);
        const pts = linePoints(paths()[1].getAttribute('d')!);
        const n = pts.length;
        const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
        // non-wrap layout: M end2 -> higherBase ... lowerBase -> end1
        const [end2, higherBase, lowerBase, end1] = [pts[0], pts[1], pts[n - 2], pts[n - 1]];
        expect(dist(end1, lowerBase)).withContext(JSON.stringify(tip)).toBeLessThanOrEqual(dist(end2, lowerBase));
        expect(dist(end2, higherBase)).withContext(JSON.stringify(tip)).toBeLessThanOrEqual(dist(end1, higherBase));
        expect(dist(end1, end2)).toBeCloseTo(10, 1);
      }
    });

    it('marks whisper open-tail strokes as dashed', () => {
      make({ openTail: true, isWhisper: true }).render('Hi', { x: 70, y: 150 });
      expect(paths()[1].getAttribute('stroke-dasharray')).toBe('6 4');
      expect(paths()[0].hasAttribute('stroke-dasharray')).toBeFalse();
    });
  });

  describe('rectangle / caption boxes (cornerRadius 0)', () => {
    it('sharpCorners gives a true rectangle whose points all lie on the border', () => {
      make({ cornerRadius: 0, sharpCorners: true }).render('Narrator');
      const pts = linePoints(paths()[0].getAttribute('d')!);
      expect(pts.length).toBeGreaterThan(100);
      for (const p of pts) {
        const onBorder = p.x === 0 || p.x === W || p.y === 0 || p.y === H;
        expect(onBorder).withContext(JSON.stringify(p)).toBeTrue();
      }
    });

    it('non-sharp rectangles round the corners with an 8px radius', () => {
      make({ cornerRadius: 0 }).render('Box');
      const pts = linePoints(paths()[0].getAttribute('d')!);
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(H);
        // points in the top-left corner square lie on the 8px arc
        if (p.x < 8 && p.y < 8) {
          expect(Math.hypot(p.x - 8, p.y - 8)).toBeCloseTo(8, 1);
        }
      }
      expect(pts.some((p) => p.x === 0 && p.y === 0)).toBeFalse();
    });

    it('clamps the corner radius for tiny boxes', () => {
      const b = make({ cornerRadius: 0 });
      const d = b.createSquirclePath(5, 3, 10, 6, 0) as string;
      const pts = linePoints(d);
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(-0.01);
        expect(p.x).toBeLessThanOrEqual(10.01);
        expect(p.y).toBeGreaterThanOrEqual(-0.01);
        expect(p.y).toBeLessThanOrEqual(6.01);
      }
    });

    it('uses a narrow (5px) tail base for rectangles', () => {
      make({ cornerRadius: 0 }).render('Box', { x: 70, y: 150 });
      const pts = linePoints(paths()[0].getAttribute('d')!);
      const tipIdx = pts.findIndex((p) => p.x === 70 && p.y === 150);
      const baseWidth = Math.abs(pts[tipIdx + 1].x - pts[tipIdx - 1].x);
      // two base points >= 5px either side of the centre sample (vs >= 8px for rounded balloons)
      expect(baseWidth).toBeGreaterThanOrEqual(9.9);
      expect(baseWidth).toBeLessThan(16);
    });

    it('snaps near-edge points to the cut edges', () => {
      make({ cornerRadius: 0, cutTop: true, cutLeft: true, cutRight: true }).render('Box');
      const pts = linePoints(paths()[0].getAttribute('d')!);
      for (const p of pts) {
        expect(p.y === 0 || p.y >= 1).toBeTrue();
        expect(p.x === 0 || p.x === W || (p.x >= 1 && p.x <= W - 1)).toBeTrue();
      }
    });
  });

  describe('cut (panel-border) balloons', () => {
    it('cutTop flattens the top edge onto y = 0', () => {
      make({ cutTop: true }).render('Hi');
      const pts = linePoints(paths()[0].getAttribute('d')!);
      expect(Math.min(...pts.map((p) => p.y))).toBe(0);
      expect(pts.filter((p) => p.y === 0).length).toBeGreaterThan(10);
    });

    it('cutRight / cutLeft flatten the sides onto x = W / x = 0', () => {
      make({ cutRight: true, cutLeft: true }).render('Hi');
      const pts = linePoints(paths()[0].getAttribute('d')!);
      expect(Math.max(...pts.map((p) => p.x))).toBe(W);
      expect(Math.min(...pts.map((p) => p.x))).toBe(0);
      expect(pts.filter((p) => p.x === W).length).toBeGreaterThan(10);
      expect(pts.filter((p) => p.x === 0).length).toBeGreaterThan(10);
    });

    it('bottom cut stretches and then clamps onto y = H like the other cuts', () => {
      const b = make();
      const d = b.createSquirclePath(70, 40, W, H, 0.45, null, { bottom: true }) as string;
      const pts = linePoints(d);
      expect(Math.max(...pts.map((p) => p.y))).toBe(H);
      expect(pts.filter((p) => p.y === H).length).toBeGreaterThan(10);
      // the top half is untouched
      expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(0, 1);
    });

    it('bottom cut also snaps rectangle points onto the bottom edge', () => {
      const d = make({ cornerRadius: 0 }).createSquirclePath(70, 40, W, H, 0, null, { bottom: true }) as string;
      for (const p of linePoints(d)) {
        expect(p.y === H || p.y <= H - 1).toBeTrue();
      }
    });

    it('uses the 0.4 corner radius and no cuts by default', () => {
      const b = make();
      const d = b.createSquirclePath(70, 40, W, H) as string;
      expect(d.startsWith('M 0.00 40.00')).toBeTrue();
      expect(d.endsWith(' Z')).toBeTrue();
    });
  });

  describe('thought balloons', () => {
    it('draws a bumpy cloud of cubic curves whose anchors lie on the ellipse', () => {
      const res = make({ isThought: true }).render('Hmm');
      const d = paths()[0].getAttribute('d')!;
      expect(d.startsWith('M ')).toBeTrue();
      expect(d.endsWith(' Z')).toBeTrue();
      const ends = cubicEnds(d);
      expect(ends.length).toBeGreaterThanOrEqual(6);
      for (const p of ends) {
        const r = ((p.x - 70) / 70) ** 2 + ((p.y - 40) / 40) ** 2;
        expect(r).toBeCloseTo(1, 1);
      }
      // closes on its starting anchor
      expect(ends[ends.length - 1]).toEqual(linePoints(d)[0]);
      // thought balloons get 20px extra viewBox padding
      expect(res.svg.getAttribute('viewBox')).toBe('-22 -22 184 124');
      expect(container.querySelectorAll('circle').length).toBe(0);
    });

    it('never uses fewer than 6 bumps for tiny clouds', () => {
      const d = make().createThoughtBalloonPath(5, 5, 10, 10);
      expect(cubicEnds(d).length).toBe(6);
    });

    it('adds three shrinking thought bubbles that end exactly at the tail tip', () => {
      make({ isThought: true, fillColor: '#fafafa', strokeColor: '#222', strokeWidth: 1.5 }).render('Hmm', {
        x: 70,
        y: 150,
      });
      const circles = Array.from(container.querySelectorAll('circle'));
      expect(circles.map((c) => c.getAttribute('r'))).toEqual(['8', '5', '3']);
      expect(circles.map((c) => c.getAttribute('cx'))).toEqual(['70.00', '70.00', '70.00']);
      // edge = cy + ry + 5 = 85; tip y = 150; t = 0.2 + 0.8 * (i + 1) / 3
      expect(circles.map((c) => +c.getAttribute('cy')!)).toEqual([115.33, 132.67, 150]);
      expect(circles[0].getAttribute('fill')).toBe('#fafafa');
      expect(circles[0].getAttribute('stroke')).toBe('#222');
      expect(circles[0].getAttribute('stroke-width')).toBe('1.5');
      // the cloud outline itself does not include the tip
      expect(paths()[0].getAttribute('d')).not.toContain('150.00');
    });

    it('adds extra padding to the natural height for thought balloons', () => {
      const plain = new ComicBalloon(container, { fontSize: 10 }).render('Hmm');
      const thought = new ComicBalloon(container, { fontSize: 10, isThought: true }).render('Hmm');
      expect(thought.height - plain.height).toBe(2 * Math.round(10 * 0.4));
    });
  });

  describe('shout balloons', () => {
    it('draws a jagged burst: peaks outside and valleys inside the enlarged ellipse', () => {
      const res = make({ isShout: true }).render('BANG');
      const d = paths()[0].getAttribute('d')!;
      expect(d).not.toContain('Q');
      expect(d).not.toContain('C');
      const pts = linePoints(d);
      expect(pts.length % 2).toBe(0);
      expect(pts.length).toBeGreaterThanOrEqual(20);
      const rx = W / 2 + 10;
      const ry = H / 2 + 10;
      pts.forEach((p, i) => {
        const r = Math.sqrt(((p.x - 70) / rx) ** 2 + ((p.y - 40) / ry) ** 2);
        if (i % 2 === 0) {
          expect(r).withContext(`peak ${i}`).toBeGreaterThan(1.1);
        } else {
          expect(r).withContext(`valley ${i}`).toBeLessThanOrEqual(1.001);
        }
      });
      expect(res.svg.getAttribute('viewBox')).toBe('-14 -14 168 108');
    });

    it('replaces the peak closest to the tail direction with the tail tip', () => {
      const without = linePoints(make({ isShout: true }).render('BANG').svg.querySelector('path')!.getAttribute('d')!);
      make({ isShout: true }).render('BANG', { x: 70, y: 200 });
      const withTail = linePoints(paths()[0].getAttribute('d')!);

      expect(withTail.length).toBe(without.length);
      const changed = withTail
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => p.x !== without[i].x || p.y !== without[i].y);
      expect(changed.length).toBe(1);
      expect(changed[0].p).toEqual({ x: 70, y: 200 });
      // it replaced the peak whose direction from the centre is closest to the tail direction (straight down)
      let best = -1;
      let bestDiff = Infinity;
      without.forEach((p, i) => {
        if (i % 2 !== 0) return;
        const diff = Math.abs(Math.atan2(p.y - 40, p.x - 70) - Math.PI / 2);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      });
      expect(changed[0].i).toBe(best);
    });

    it('adds shout padding to the natural height', () => {
      const plain = new ComicBalloon(container, { fontSize: 20 }).render('X');
      const shout = new ComicBalloon(container, { fontSize: 20, isShout: true }).render('X');
      expect(shout.height - plain.height).toBe(16);
    });
  });

  describe('whisper balloons', () => {
    it('dash the outline', () => {
      make({ isWhisper: true }).render('psst');
      expect(paths()[0].getAttribute('stroke-dasharray')).toBe('6 4');
    });
  });

  describe('hideBorder', () => {
    it('splits fill and stroke and clips the stroke with a wedge polygon', () => {
      const res = make({ hideBorder: { angle: 180, arc: 60 } }).render('Hi');
      const [fill, stroke] = paths();
      expect(paths().length).toBe(2);
      expect(fill.getAttribute('stroke')).toBe('none');
      expect(fill.getAttribute('d')).toBe(stroke.getAttribute('d'));

      const clip = res.svg.querySelector('defs clipPath')!;
      const id = clip.getAttribute('id')!;
      expect(id).toMatch(/^hide-clip-[a-z0-9]+$/);
      expect(stroke.getAttribute('clip-path')).toBe(`url(#${id})`);

      const pts = clip
        .querySelector('polygon')!
        .getAttribute('points')!
        .split(' ')
        .map((s) => s.split(',').map(Number));
      expect(pts.length).toBe(38);
      expect(pts[0]).toEqual([70, 40]);
      // visible wedge starts at 210deg (bottom-left) and sweeps 300deg; the hidden part is centred at 180 (bottom)
      const R = Math.max(154, 94) * 2;
      const start = ((210 / 360) * Math.PI * 2) - Math.PI / 2;
      expect(pts[1][0]).toBeCloseTo(70 + R * Math.cos(start), 1);
      expect(pts[1][1]).toBeCloseTo(40 + R * Math.sin(start), 1);
      const end = ((510 / 360) * Math.PI * 2) - Math.PI / 2;
      expect(pts[37][0]).toBeCloseTo(70 + R * Math.cos(end), 1);
      expect(pts[37][1]).toBeCloseTo(40 + R * Math.sin(end), 1);
      // no polygon vertex (other than the centre) points straight down
      for (const [x, y] of pts.slice(1)) {
        expect(y > 40 && Math.abs(x - 70) < 1).toBeFalse();
      }
    });

    it('combines with whisper dashing', () => {
      make({ hideBorder: { angle: 0, arc: 30 }, isWhisper: true }).render('Hi');
      expect(paths()[1].getAttribute('stroke-dasharray')).toBe('6 4');
    });
  });

  describe('createShoutBalloonPath (direct)', () => {
    it('defaults to no tail', () => {
      const b = make();
      expect(b.createShoutBalloonPath(70, 40, W, H)).toBe(b.createShoutBalloonPath(70, 40, W, H, null));
    });
  });

  describe('normalizeAngle', () => {
    it('wraps angles into [-PI, PI]', () => {
      const b = make();
      expect(b.normalizeAngle(0)).toBe(0);
      expect(b.normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
      expect(b.normalizeAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 10);
      expect(b.normalizeAngle(Math.PI / 2 + 4 * Math.PI)).toBeCloseTo(Math.PI / 2, 10);
      expect(b.normalizeAngle(-Math.PI / 2 - 6 * Math.PI)).toBeCloseTo(-Math.PI / 2, 10);
    });
  });

  describe('createBalloon helper', () => {
    it('constructs and renders in one go', () => {
      const res = createBalloon(container, 'Hey', { x: 70, y: 150 }, { maxWidth: W, maxHeight: H, isWhisper: true });
      expect(res.balloon).toEqual(jasmine.any(ComicBalloon));
      expect(res.width).toBe(W);
      expect(container.querySelector('path')!.getAttribute('d')).toContain('L 70.00 150.00');
      expect(container.querySelector('path')!.getAttribute('stroke-dasharray')).toBe('6 4');
    });

    it('uses empty options by default', () => {
      const res = createBalloon(container, 'Hey', null);
      expect(res.balloon.options.maxWidth).toBe(140);
    });
  });
});
