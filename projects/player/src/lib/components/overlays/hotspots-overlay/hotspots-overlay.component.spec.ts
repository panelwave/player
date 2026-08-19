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
});
