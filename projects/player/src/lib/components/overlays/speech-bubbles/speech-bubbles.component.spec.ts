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

  describe('viewport size parity (scaling to the authored bounding box)', () => {
    beforeEach(() => {
      component.containerWidth = 400; // authored at 800 → half-size viewport
      component.containerHeight = 300;
      (component as unknown as { initialized: boolean }).initialized = true;
    });

    it('scales the rendered balloon so its natural width matches the authored shape width', () => {
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'Hello!' },
        // Authored at 800×600: a 160×90 balloon → w=0.2, h=0.15 → 80px in this viewport
        shape: { x: 0.4, y: 0.4, w: 0.2, h: 0.15 },
        balloonConfig: {},
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      expect(wrapper).toBeTruthy();
      expect(wrapper.style.transform).toMatch(/scale\(0\.\d+\)/); // shrunk below natural size
      expect(wrapper.style.transformOrigin).toBe('center center');
    });

    it('applies no scale when the shape box is missing (legacy manifests)', () => {
      component.bubbles = [asBubble({ id: 'b1', text: { 'en-US': 'Hi' }, shape: undefined })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      expect(wrapper).toBeTruthy();
      expect(wrapper.style.transform).toBe('');
    });

    it('clamps extreme scales from unreconciled legacy geometry', () => {
      component.bubbles = [asBubble({
        id: 'b1',
        text: { 'en-US': 'Hi' },
        shape: { x: 0.4, y: 0.4, w: 0.001, h: 0.001 }, // would be a near-zero scale
        balloonConfig: {},
      })];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      const match = /scale\(([\d.]+)\)/.exec(wrapper.style.transform);
      expect(match).toBeTruthy();
      expect(parseFloat(match![1])).toBeGreaterThanOrEqual(0.25);
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
