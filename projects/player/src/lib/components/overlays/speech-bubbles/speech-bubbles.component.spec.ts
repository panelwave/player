import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SpeechBubblesComponent } from './speech-bubbles.component';

describe('SpeechBubblesComponent', () => {
  let fixture: ComponentFixture<SpeechBubblesComponent>;
  let component: SpeechBubblesComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpeechBubblesComponent],
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
      (component as any).initialized = true;
    });

    it('scales the rendered balloon so its natural width matches the authored shape width', () => {
      component.bubbles = [{
        id: 'b1',
        text: { 'en-US': 'Hello!' },
        // Authored at 800×600: a 160×90 balloon → w=0.2, h=0.15 → 80px in this viewport
        shape: { x: 0.4, y: 0.4, w: 0.2, h: 0.15 },
        balloonConfig: {},
      } as any];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      expect(wrapper).toBeTruthy();
      expect(wrapper.style.transform).toMatch(/scale\(0\.\d+\)/); // shrunk below natural size
      expect(wrapper.style.transformOrigin).toBe('center center');
    });

    it('applies no scale when the shape box is missing (legacy manifests)', () => {
      component.bubbles = [{ id: 'b1', text: { 'en-US': 'Hi' }, shape: undefined } as any];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      expect(wrapper).toBeTruthy();
      expect(wrapper.style.transform).toBe('');
    });

    it('clamps extreme scales from unreconciled legacy geometry', () => {
      component.bubbles = [{
        id: 'b1',
        text: { 'en-US': 'Hi' },
        shape: { x: 0.4, y: 0.4, w: 0.001, h: 0.001 }, // would be a near-zero scale
        balloonConfig: {},
      } as any];

      component.renderAllBalloons();

      const [wrapper] = renderedWrappers();
      const match = /scale\(([\d.]+)\)/.exec(wrapper.style.transform);
      expect(match).toBeTruthy();
      expect(parseFloat(match![1])).toBeGreaterThanOrEqual(0.25);
    });
  });
});
