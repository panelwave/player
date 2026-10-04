/**
 * Unit tests for HotspotsOverlayComponent
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HotspotsOverlayComponent } from './hotspots-overlay.component';
import type { Hotspot } from '../../../types';

const HS: Hotspot[] = [
  {
    id: 'hs-rect',
    shape: { type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    label: { 'en-US': 'Door', 'de-DE': 'Tür' },
    action: { type: 'setVariables', mutations: [{ op: 'set', var: 'v', value: 1 }] },
  },
  {
    id: 'hs-hidden',
    shape: { type: 'circle', cx: 0.5, cy: 0.5, r: 0.1 },
    label: { 'en-US': 'Secret' },
    visibleIf: { '==': [{ var: 'hasKey' }, true] },
    action: { type: 'goTo', to: 'p2' },
  },
];

describe('HotspotsOverlayComponent', () => {
  let fixture: ComponentFixture<HotspotsOverlayComponent>;
  let component: HotspotsOverlayComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HotspotsOverlayComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HotspotsOverlayComponent);
    component = fixture.componentInstance;
    component.hotspots = HS;
    component.containerWidth = 1000;
    component.containerHeight = 500;
    component.context = { hasKey: false };
    component.ngOnChanges();
    fixture.detectChanges();
  });

  it('renders a denormalized rect for a visible hotspot', () => {
    const rect: SVGRectElement | null = fixture.nativeElement.querySelector('rect');
    expect(rect).toBeTruthy();
    expect(rect!.getAttribute('x')).toBe('100'); // 0.1 * 1000
    expect(rect!.getAttribute('y')).toBe('100'); // 0.2 * 500
    expect(rect!.getAttribute('width')).toBe('300');
    expect(rect!.getAttribute('height')).toBe('200');
  });

  it('filters hotspots whose visibleIf evaluates false', () => {
    expect(fixture.nativeElement.querySelectorAll('.hotspot-shape').length).toBe(1);
  });

  it('shows a conditional hotspot once its condition holds', () => {
    fixture.componentRef.setInput('context', { hasKey: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.hotspot-shape').length).toBe(2);
    const circle: SVGCircleElement | null = fixture.nativeElement.querySelector('circle');
    expect(circle).toBeTruthy();
    expect(circle!.getAttribute('cx')).toBe('500');
    expect(circle!.getAttribute('cy')).toBe('250');
    expect(circle!.getAttribute('r')).toBe('100'); // r normalized to WIDTH
  });

  it('resolves the label for the active locale with base-language fallback', () => {
    component.locale = 'de-AT';
    component.ngOnChanges();
    expect(component.resolveLabel(HS[0])).toBe('Tür');
  });

  it('emits normalized coordinates on keyboard activation (shape centroid)', () => {
    const spy = jasmine.createSpy();
    component.hotspotActivate.subscribe(spy);
    component.activateByKeyboard(HS[0]);
    expect(spy).toHaveBeenCalledWith({ hotspot: HS[0], x: 0.25, y: 0.4 }); // rect center
  });

  it('does not emit when not interactive', () => {
    const spy = jasmine.createSpy();
    component.hotspotActivate.subscribe(spy);
    component.interactive = false;
    component.activateByKeyboard(HS[0]);
    expect(spy).not.toHaveBeenCalled();
  });

  describe('choice buttons', () => {
    const choice = (id: string, to: string, y: number): Hotspot => ({
      id,
      shape: { type: 'rect', x: 0.2, y, w: 0.6, h: 0.08 },
      label: { 'en-US': `Go ${to}`, 'de-DE': `Nach ${to}` },
      action: { type: 'goTo', to },
    });

    it('shows the labels of a decision (goTo hotspots to 2+ panels) as button text', () => {
      fixture.componentRef.setInput('hotspots', [choice('a', 'p8', 0.78), choice('b', 'p9', 0.88)]);
      fixture.componentRef.setInput('locale', 'de-DE');
      fixture.detectChanges();
      const labels = Array.from(fixture.nativeElement.querySelectorAll('.hotspot-label')).map((e) => (e as HTMLElement).textContent?.trim());
      expect(labels).toEqual(['Nach p8', 'Nach p9']);
      expect(fixture.nativeElement.querySelectorAll('.hotspot-shape.choice').length).toBe(2);
    });

    it('keeps goTo hotspots to a single panel (a detour) invisible areas', () => {
      fixture.componentRef.setInput('hotspots', [choice('a', 'p8', 0.78), choice('b', 'p8', 0.88)]);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.hotspot-label').length).toBe(0);
      expect(component.choiceText(component.hotspots[0])).toBe('');
    });

    it('sizes the label to the button height within readable bounds', () => {
      expect(component.choiceFontSize(choice('a', 'p8', 0.78))).toBeCloseTo(Math.max(9, Math.min(18, 0.08 * 500 * 0.42)), 5);
      expect(component.boundsOf({ type: 'circle', cx: 0.5, cy: 0.5, r: 0.1 })).toEqual({ x: 400, y: 150, width: 200, height: 200 });
    });
  });
});
