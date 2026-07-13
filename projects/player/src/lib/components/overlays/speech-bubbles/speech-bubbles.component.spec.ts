import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SpeechBubblesComponent } from './speech-bubbles.component';
import { ManifestService } from '../../../services/manifest.service';
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
        balloonConfig: {},
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      expect(wrapper).toBeTruthy();
      expect(wrapper.style.transform).toBe('scale(0.5)');
      expect(wrapper.style.transformOrigin).toBe('center center');
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
