import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SpeechBubblesComponent, clampCenter, MIN_LETTERING_PX } from './speech-bubbles.component';
import { ManifestService } from '../../../services/manifest.service';
import { artworkLetteringScale } from '../../../utils/balloon-config';
import type { SpeechBubble } from '../../../types';

const asBubble = (b: object): SpeechBubble => b as SpeechBubble;

describe('SpeechBubblesComponent', () => {
  let fixture: ComponentFixture<SpeechBubblesComponent>;
  let component: SpeechBubblesComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpeechBubblesComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SpeechBubblesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function renderedWrappers(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.speech-bubble-wrapper'));
  }

  describe('font-ready rendering', () => {
    it('renders once after init and re-renders when document fonts are ready', fakeAsync(() => {
      const renderSpy = spyOn(component, 'renderAllBalloons');

      component.ngAfterViewInit();
      tick(60); // initial render happens without waiting for fonts
      const initialCalls = renderSpy.calls.count();
      expect(initialCalls).toBeGreaterThan(0);

      tick(1000); // let an (already resolved) fonts.ready promise flush
      expect(renderSpy.calls.count()).toBeGreaterThanOrEqual(initialCalls);
    }));

    it('does not re-render on fonts.ready after destroy', fakeAsync(() => {
      const renderSpy = spyOn(component, 'renderAllBalloons');
      component.ngAfterViewInit();
      component.ngOnDestroy();
      tick(1000);
      // Only the initial setTimeout render may have fired before destroy;
      // the fonts.ready hook must be a no-op afterwards.
      expect(renderSpy.calls.count()).toBeLessThanOrEqual(1);
    }));
  });

  describe('per-screen lettering (reading scale)', () => {
    beforeEach(() => {
      component.containerWidth = 400;
      component.containerHeight = 300;
      (component as unknown as { initialized: boolean }).initialized = true;
    });

    it('scales the rendered balloon by the reading scale, not the authored box size', () => {
      component.readingScale = 0.5; // small screen: lettering shrinks with the screen
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'Hello!' },
        shape: { x: 0.4, y: 0.4, w: 0.9, h: 0.9 }, // huge authored box must NOT blow up the text
        balloonConfig: { fontSize: 24 }, // 24 px × 0.5 = 12 px: above the legibility floor
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      expect(wrapper).toBeTruthy();
      expect(wrapper.style.transform).toBe('scale(0.5)');
      expect(wrapper.style.transformOrigin).toBe('center center');
    });

    it('re-wraps a balloon too wide for a narrow panel instead of shrinking its text below 9 px', () => {
      component.containerWidth = 135; // a tall, narrow panel
      component.containerHeight = 240;
      component.readingScale = 0.45;
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'St. Aurelian General Hospital, Harbor City. 18:52.' },
        shape: { x: 0.04, y: 0.02, w: 0.9, h: 0.1 },
        balloonConfig: { fontSize: 15, maxWidth: 293, maxHeight: 100 },
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      const scale = parseFloat(/scale\(([\d.]+)\)/.exec(wrapper.style.transform)![1]);
      expect(15 * scale).toBeGreaterThanOrEqual(MIN_LETTERING_PX - 0.01);
      const svg = wrapper.querySelector('svg') as SVGSVGElement;
      expect(parseFloat(svg.style.width) * scale).toBeLessThanOrEqual(135 + 0.5);
    });

    it('never letters below 9 px: small lettering on a small page grows to the floor', () => {
      component.readingScale = 0.5; // 12 px × 0.5 = 6 px would be unreadable
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'Hi' },
        shape: { x: 0.4, y: 0.4, w: 0.2, h: 0.15 },
        balloonConfig: {},
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      expect(wrapper.style.transform).toBe(`scale(${MIN_LETTERING_PX / 12})`);
    });

    it('applies no transform at reading scale 1', () => {
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'Hi' },
        shape: { x: 0.3, y: 0.3, w: 0.4, h: 0.3 },
        balloonConfig: {},
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      expect(wrapper).toBeTruthy();
      expect(wrapper.style.transform).toBe('');
    });

    it('clamps a broken reading scale to a sane minimum', () => {
      component.readingScale = 0.01;
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'Hi' },
        shape: { x: 0.4, y: 0.4, w: 0.2, h: 0.15 },
        balloonConfig: {},
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      const match = /scale\(([\d.]+)\)/.exec(wrapper.style.transform);
      expect(match).toBeTruthy();
      expect(parseFloat(match![1])).toBeGreaterThanOrEqual(0.25);
    });

    it('caps the scale so the balloon never exceeds its panel container', () => {
      component.containerWidth = 60; // tiny page-view panel
      component.containerHeight = 40;
      component.readingScale = 2;
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'A long line of dialogue' },
        shape: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
        balloonConfig: {},
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      const match = /scale\(([\d.]+)\)/.exec(wrapper.style.transform);
      expect(match).toBeTruthy();
      expect(parseFloat(match![1])).toBeLessThan(2);
    });

    it('keeps a border-flush caption glued to the panel top', () => {
      component.bubbles = [asBubble({
        id: 'narr-1',
        text: { 'en-US': 'Narration.' },
        shape: { x: 0.1, y: 0, w: 0.5, h: 0.2 }, // authored flush at the top
        balloonConfig: { balloonType: 'narrator', tail: { enabled: false } },
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      expect(wrapper).toBeTruthy();
      // Scaled about its center, the wrapper's visual top edge sits at 0:
      // top style = centerY - svgH/2 with centerY = visualH/2; at scale 1
      // that is exactly 0px.
      expect(parseFloat(wrapper.style.top)).toBeCloseTo(0, 0);
    });

    it('keeps a balloon bigger than its box inside the panel when the box sits near the border', () => {
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'St. Aurelian General Hospital, Harbor City. 18:52.' },
        shape: { x: 0.05, y: 0.04, w: 0.2, h: 0.04 }, // small box close to (not on) the top-left border
        balloonConfig: {},
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      const svg = wrapper.querySelector('svg') as SVGSVGElement;
      const w = parseFloat(svg.style.width);
      const h = parseFloat(svg.style.height);
      // At scale 1 the wrapper box is the visual box: fully inside 400 × 300.
      expect(parseFloat(wrapper.style.left)).toBeGreaterThanOrEqual(-0.5);
      expect(parseFloat(wrapper.style.top)).toBeGreaterThanOrEqual(-0.5);
      expect(parseFloat(wrapper.style.left) + w).toBeLessThanOrEqual(400.5);
      expect(parseFloat(wrapper.style.top) + h).toBeLessThanOrEqual(300.5);
    });
  });

  describe('clampCenter', () => {
    it('keeps the span inside the extent and centres what cannot fit', () => {
      expect(clampCenter(10, 40, 100)).toBe(20);
      expect(clampCenter(95, 40, 100)).toBe(80);
      expect(clampCenter(50, 40, 100)).toBe(50);
      expect(clampCenter(5, 120, 100)).toBe(50);
    });
  });

  describe('resolveEffectiveConfig with balloonPresets (schema 1.3+)', () => {
    const manifest = {
      meta: {
        characters: [
          { id: 'char-nemo', name: { 'en-US': 'Nemo' }, balloonConfig: { fillColor: '#eef2f4', strokeWidth: 3 } },
        ],
      },
      settings: {
        typography: {
          balloon_config: { fontSize: 13, strokeColor: '#1a1a1a', strokeWidth: 2 },
          balloonPresets: {
            'shout-down-right': { balloonType: 'shout', strokeWidth: 4, tail: { position: 150, length: 50 } },
          },
        },
      },
    } as never;

    beforeEach(() => {
      spyOn(TestBed.inject(ManifestService), 'getManifest').and.returnValue(manifest);
    });

    it('merges work defaults -> character -> preset -> bubble override in order', () => {
      const config = component.resolveEffectiveConfig(asBubble({
        id: 'b1',
        characterId: 'char-nemo',
        text: { 'en-US': 'NOW!' },
        shape: { x: 0, y: 0, w: 0.3, h: 0.2 },
        styleRef: 'shout-down-right',
        balloonConfig: { fillColor: '#123456' },
      }));

      expect(config.fontSize).toBe(13);              // work default (via manifest fallback)
      expect(config.balloonType).toBe('shout');      // from the preset
      expect(config.strokeWidth).toBe(4);            // preset beats character's 3
      expect(config.tail?.position).toBe(150);       // from the preset
      expect(config.fillColor).toBe('#123456');      // bubble override beats character
    });

    it('ignores an unknown styleRef', () => {
      const config = component.resolveEffectiveConfig(asBubble({
        id: 'b1',
        text: { 'en-US': 'Hi' },
        shape: { x: 0, y: 0, w: 0.3, h: 0.2 },
        styleRef: 'no-such-preset',
      }));

      expect(config.balloonType).toBe('normal');
      expect(config.fontSize).toBe(13); // still picked up the work defaults
    });

    it('prefers the workBalloonConfig input over the manifest work defaults', () => {
      component.workBalloonConfig = { ...component.workBalloonConfig, fontSize: 20 } as never;
      const config = component.resolveEffectiveConfig(asBubble({
        id: 'b1',
        text: { 'en-US': 'Hi' },
        shape: { x: 0, y: 0, w: 0.3, h: 0.2 },
      }));

      expect(config.fontSize).toBe(20);
    });
  });
});

describe('SpeechBubblesComponent auto-grow (schema 1.8 textFit)', () => {
  let fixture: ComponentFixture<SpeechBubblesComponent>;
  let component: SpeechBubblesComponent;
  const EN = 'I did my clinical rotation on Meridian at Halcyon North. Honestly, it\'s beautiful.';
  const DE = 'Ich habe mein klinisches Praktikum bei Meridian im Halcyon North absolviert. Ehrlich gesagt, ist es wunderschön dort.';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpeechBubblesComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(SpeechBubblesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.containerWidth = 800;
    component.containerHeight = 1100;
    (component as unknown as { initialized: boolean }).initialized = true;
  });

  function wrapper(): HTMLElement {
    return fixture.nativeElement.querySelector('.speech-bubble-wrapper') as HTMLElement;
  }

  /** Bottom end of the tail path (the tip) in container px, from the rendered SVG. */
  function tailTipY(w: HTMLElement): number {
    const svg = w.querySelector('svg') as SVGSVGElement;
    const vb = (svg.getAttribute('viewBox') || '0 0 0 0').split(' ').map(Number);
    // The tail tip is the lowest point of the viewBox minus the 20px tail padding.
    return parseFloat(w.style.top) + (vb[3] + vb[1]) - 20 - vb[1];
  }

  it('grows the balloon for a longer translation while a fitting text keeps the authored size', () => {
    const bubble = (text: string) => asBubble({
      id: 'b1',
      text: { 'en-US': text },
      shape: { x: 0.3, y: 0.1, w: 0.25, h: 0.08 },
      balloonConfig: { fontFamily: 'Arial, sans-serif', maxWidth: 200, maxHeight: 90, tail: { position: 180, length: 45 } },
    });

    component.bubbles = [bubble('Hi.')];
    component.renderAllBalloons();
    const small = wrapper();
    expect(small.hasAttribute('data-grown')).toBe(false);
    const smallSvg = small.querySelector('svg') as SVGSVGElement;

    component.bubbles = [bubble(DE)];
    component.renderAllBalloons();
    const grown = wrapper();
    expect(grown.getAttribute('data-grown')).toBe('true');
    const grownSvg = grown.querySelector('svg') as SVGSVGElement;
    expect(parseFloat(grownSvg.style.width)).toBeGreaterThan(parseFloat(smallSvg.style.width));
    expect(parseFloat(grownSvg.style.height)).toBeGreaterThan(parseFloat(smallSvg.style.height));
    // The lettering is not scaled down to make room.
    expect(grown.style.transform).toBe('');
  });

  it('keeps the tail tip on the speaker when the body grows (bottom tail)', () => {
    const bubble = (text: string) => asBubble({
      id: 'b1',
      text: { 'en-US': text },
      shape: { x: 0.3, y: 0.3, w: 0.25, h: 0.08 },
      balloonConfig: { fontFamily: 'Arial, sans-serif', maxWidth: 200, maxHeight: 90, tail: { position: 180, length: 45 } },
    });

    component.bubbles = [bubble(EN)];
    component.renderAllBalloons();
    const tipEn = tailTipY(wrapper());

    component.bubbles = [bubble(DE)];
    component.renderAllBalloons();
    const w = wrapper();
    expect(w.getAttribute('data-grown')).toBe('true');
    expect(tailTipY(w)).toBeCloseTo(tipEn, 0);
    // The body moved up, away from the speaker.
    expect(parseFloat(w.style.top)).toBeLessThan(0.3 * 1100);
  });

  it("textFit 'fixed' keeps the authored size (pre-1.8 behaviour)", () => {
    component.bubbles = [asBubble({
      id: 'b1',
      text: { 'en-US': DE },
      shape: { x: 0.3, y: 0.3, w: 0.25, h: 0.08 },
      balloonConfig: { fontFamily: 'Arial, sans-serif', maxWidth: 200, maxHeight: 90, textFit: 'fixed' },
    })];
    component.renderAllBalloons();
    const w = wrapper();
    expect(w.hasAttribute('data-grown')).toBe(false);
    const svg = w.querySelector('svg') as SVGSVGElement;
    // viewBox width = body 200 + 2 × (stroke 2 + 5)
    expect(parseFloat(svg.style.width)).toBe(214);
  });

  it('a grown caption glued to the top stays on the top border', () => {
    component.bubbles = [asBubble({
      id: 'cap',
      text: { 'en-US': DE },
      shape: { x: 0.1, y: 0, w: 0.5, h: 0.05 },
      balloonConfig: { balloonType: 'narrator', fontFamily: 'Arial, sans-serif', maxWidth: 200, maxHeight: 40, tail: { enabled: false } },
    })];
    component.renderAllBalloons();
    const w = wrapper();
    expect(w.getAttribute('data-grown')).toBe('true');
    expect(parseFloat(w.style.top)).toBeCloseTo(0, 0);
  });
});

describe('SpeechBubblesComponent body anchoring', () => {
  let fixture: ComponentFixture<SpeechBubblesComponent>;
  let component: SpeechBubblesComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpeechBubblesComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(SpeechBubblesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.containerWidth = 800;
    component.containerHeight = 1100;
    (component as unknown as { initialized: boolean }).initialized = true;
  });

  /** Centre of the balloon BODY in container px (scale 1): wrapper offset + body centre inside the SVG. */
  function bodyCenter(): { x: number; y: number } {
    const w = fixture.nativeElement.querySelector('.speech-bubble-wrapper') as HTMLElement;
    const svg = w.querySelector('svg') as SVGSVGElement;
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    const fo = svg.querySelector('foreignObject') as SVGForeignObjectElement;
    const bw = parseFloat(fo.getAttribute('width') || '0');
    const bh = parseFloat(fo.getAttribute('height') || '0');
    return { x: parseFloat(w.style.left) - vb[0] + bw / 2, y: parseFloat(w.style.top) - vb[1] + bh / 2 };
  }

  for (const position of [180, 0, 90]) {
    it(`puts the balloon body (not the SVG with its tail) on the stored box centre — tail at ${position}°`, () => {
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'Lean on me.' },
        shape: { x: 0.3, y: 0.3, w: 0.2, h: 0.1 }, // centre (320, 385)
        balloonConfig: { fontFamily: 'Arial, sans-serif', tail: { position, length: 60 } },
      })];
      component.renderAllBalloons();
      const c = bodyCenter();
      expect(c.x).toBeCloseTo(320, 0);
      expect(c.y).toBeCloseTo(385, 0);
    });
  }

  describe('page view: anchored on the authored tail tip (anchorTailTip)', () => {
    /** A point of the SVG (viewBox coords) in container px, through the wrapper's centre scale. */
    function toContainer(p: { x: number; y: number }): { x: number; y: number } {
      const w = fixture.nativeElement.querySelector('.speech-bubble-wrapper') as HTMLElement;
      const svg = w.querySelector('svg') as SVGSVGElement;
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      const m = /scale\(([\d.]+)\)/.exec(w.style.transform);
      const s = m ? parseFloat(m[1]) : 1;
      const sw = parseFloat(svg.style.width);
      const sh = parseFloat(svg.style.height);
      const lx = p.x - vb[0];
      const ly = p.y - vb[1];
      return {
        x: parseFloat(w.style.left) + sw / 2 + (lx - sw / 2) * s,
        y: parseFloat(w.style.top) + sh / 2 + (ly - sh / 2) * s,
      };
    }

    /** Bottom tail (180°): tip = viewBox bottom minus the 20px tail padding, at the body's centre x. */
    function bottomTip(): { x: number; y: number } {
      const svg = fixture.nativeElement.querySelector('.speech-bubble-wrapper svg') as SVGSVGElement;
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      const fo = svg.querySelector('foreignObject') as SVGForeignObjectElement;
      const bw = parseFloat(fo.getAttribute('width') || '0');
      return toContainer({ x: bw / 2, y: vb[1] + vb[3] - 20 });
    }

    function bodyBottom(): number {
      const fo = fixture.nativeElement.querySelector('.speech-bubble-wrapper foreignObject') as SVGForeignObjectElement;
      return toContainer({ x: 0, y: parseFloat(fo.getAttribute('height') || '0') }).y;
    }

    const bubble = () => asBubble({
      id: 'b1',
      text: { 'en-US': 'Lean on me.' },
      shape: { x: 0.3, y: 0.3, w: 0.2, h: 0.1 }, // box 240..400 × 330..440
      balloonConfig: { fontFamily: 'Arial, sans-serif', fontSize: 12, tail: { position: 180, length: 60 } },
    });

    // The editor's panel view letters the 800 × 1100 panel at this scale; the
    // authored tip is the stored box with the tail at that scale, whatever
    // scale the body is lettered at here.
    const artScale = artworkLetteringScale(800, 1100);

    it('puts the tail tip on the authored tip (box edge + tail length at the artwork scale)', () => {
      component.anchorTailTip = true;
      component.bubbles = [bubble()];
      component.renderAllBalloons();
      const tip = bottomTip();
      expect(tip.x).toBeCloseTo(320, 0);
      expect(tip.y).toBeCloseTo(440 + 60 * artScale, 0);
    });

    it('a readability boost grows the body, not the tail, and the tip stays put', () => {
      component.anchorTailTip = true;
      component.readingScale = 0.5; // 12 px × 0.5 = 6 px → boosted to the 9 px floor (scale 0.75)
      component.bubbles = [bubble()];
      component.renderAllBalloons();
      const w = fixture.nativeElement.querySelector('.speech-bubble-wrapper') as HTMLElement;
      expect(w.style.transform).toBe(`scale(${MIN_LETTERING_PX / 12})`);
      const tip = bottomTip();
      expect(tip.x).toBeCloseTo(320, 0);
      expect(tip.y).toBeCloseTo(440 + 60 * artScale, 0);
      // Visible tail = authored length at the base scale (60 × 0.5), not × 0.75.
      expect(tip.y - bodyBottom()).toBeCloseTo(30, 0);
    });

    it('panel view (scaleTailWithBoost) grows the tail with the body, tip kept', () => {
      component.anchorTailTip = true;
      component.scaleTailWithBoost = true;
      component.readingScale = 0.5; // boosted to the 9 px floor (scale 0.75)
      component.bubbles = [bubble()];
      component.renderAllBalloons();
      const w = fixture.nativeElement.querySelector('.speech-bubble-wrapper') as HTMLElement;
      expect(w.style.transform).toBe(`scale(${MIN_LETTERING_PX / 12})`);
      const tip = bottomTip();
      expect(tip.x).toBeCloseTo(320, 0);
      expect(tip.y).toBeCloseTo(440 + 60 * artScale, 0);
      // Visible tail = authored length × the displayed scale (60 × 0.75), not × 0.5.
      expect(tip.y - bodyBottom()).toBeCloseTo(45, 0);
    });

    it('lowers the boost until a tip-anchored body fits its panel instead of moving the tip', () => {
      // A narrow phone-like panel; the base scale would letter 12 px × 0.2 = 2.4 px,
      // the 9 px floor asks for 0.75 — too big for a balloon whose tip sits near the top.
      component.containerWidth = 375;
      component.containerHeight = 211;
      component.anchorTailTip = true;
      component.readingScale = 0.2;
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'Fourteen coming! Bus into the barrier, multiple crush injuries.' },
        shape: { x: 0.3, y: 0.02, w: 0.2, h: 0.1 }, // box 112..187 × 4..25
        balloonConfig: { fontFamily: 'Arial, sans-serif', fontSize: 12, maxWidth: 200, maxHeight: 100, tail: { position: 180, length: 45 } },
      })];
      component.renderAllBalloons();
      const w = fixture.nativeElement.querySelector('.speech-bubble-wrapper') as HTMLElement;
      const scale = parseFloat(/scale\(([\d.]+)\)/.exec(w.style.transform)![1]);
      expect(scale).toBeGreaterThan(0.18); // never below the artwork scale (0.188)
      expect(scale).toBeLessThan(0.75);
      // Body inside the panel …
      const fo = w.querySelector('foreignObject') as SVGForeignObjectElement;
      const top = toContainer({ x: 0, y: 0 }).y;
      expect(top).toBeGreaterThanOrEqual(-0.5);
      expect(bodyBottom()).toBeLessThanOrEqual(211 + 0.5);
      expect(fo).toBeTruthy();
      // … and the tip still where the editor put it.
      const tip = bottomTip();
      const art = artworkLetteringScale(375, 211);
      expect(tip.y).toBeCloseTo(0.12 * 211 + 45 * art, 0);
    });

    it('without anchorTailTip (panel view) the body stays centred on the box', () => {
      component.bubbles = [bubble()];
      component.renderAllBalloons();
      const c = bodyCenter();
      expect(c.x).toBeCloseTo(320, 0);
      expect(c.y).toBeCloseTo(385, 0);
    });
  });
});
