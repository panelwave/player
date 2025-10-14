/**
 * Unit tests for ViewportComponent
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewportComponent } from './viewport.component';
import type { Panel } from '../../types';

describe('ViewportComponent', () => {
  let component: ViewportComponent;
  let fixture: ComponentFixture<ViewportComponent>;

  const mockPanel: Panel = {
    layers: [
      { kind: 'image', id: 'layer-1', src: 'test.jpg', x: 0, y: 0, w: 800, h: 600 },
      { kind: 'text', id: 'layer-2', text: { 'en-US': 'Test' }, x: 100, y: 100 },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewportComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ViewportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should have default values', () => {
      expect(component.panel).toBeNull();
      expect(component.viewMode).toBe('panel');
      expect(component.locale).toBe('en-US');
      expect(component.panX).toBe(0);
      expect(component.panY).toBe(0);
      expect(component.zoom).toBe(1);
      expect(component.reducedMotion).toBe(false);
      expect(component.interactive).toBe(true);
    });
  });

  describe('Panel Rendering', () => {
    it('should render panel when provided', async () => {
      component.panel = mockPanel;
      fixture.detectChanges();
      await fixture.whenStable();

      const panelContainer = fixture.nativeElement.querySelector('.panel-container');
      expect(panelContainer).toBeTruthy();
    });

    it('should render all layers', async () => {
      component.panel = mockPanel;
      fixture.detectChanges();
      await fixture.whenStable();

      const layers = fixture.nativeElement.querySelectorAll('.layer');
      expect(layers.length).toBe(2);
    });

    it('should show no-panel message when panel is null', () => {
      component.panel = null;
      fixture.detectChanges();

      const noPanel = fixture.nativeElement.querySelector('.no-panel');
      expect(noPanel).toBeTruthy();
      expect(noPanel.textContent).toContain('No panel to display');
    });
  });

  describe('Transform', () => {
    it('should generate correct transform style', () => {
      component.panX = 10;
      component.panY = 20;
      component.zoom = 1.5;

      const transform = component.getTransformStyle();
      expect(transform).toBe('translate(10px, 20px) scale(1.5)');
    });

    it('should return identity transform in reduced motion mode', () => {
      component.reducedMotion = true;
      component.panX = 10;
      component.panY = 20;
      component.zoom = 1.5;

      const transform = component.getTransformStyle();
      expect(transform).toBe('translate(0, 0) scale(1)');
    });

    it('should reset transform', () => {
      spyOn(component.transformChange, 'emit');

      component.resetTransform();

      expect(component.transformChange.emit).toHaveBeenCalledWith({
        panX: 0,
        panY: 0,
        zoom: 1,
      });
    });
  });

  describe('View Mode', () => {
    it('should return correct class for panel view', () => {
      component.viewMode = 'panel';
      expect(component.getViewModeClass()).toBe('viewport-panel');
    });

    it('should return correct class for page view', () => {
      component.viewMode = 'page';
      expect(component.getViewModeClass()).toBe('viewport-page');
    });
  });

  describe('Mouse Interactions - Pan', () => {
    it('should start dragging on mouse down', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 50 });

      component.onMouseDown(event);

      expect(component.isDragging).toBe(true);
      expect(component.dragStartX).toBe(100);
      expect(component.dragStartY).toBe(50);
    });

    it('should not start dragging on right click', () => {
      const event = new MouseEvent('mousedown', { button: 2, clientX: 100, clientY: 50 });

      component.onMouseDown(event);

      expect(component.isDragging).toBe(false);
    });

    it('should emit transform change on mouse move while dragging', () => {
      spyOn(component.transformChange, 'emit');

      component.isDragging = true;
      component.dragStartX = 100;
      component.dragStartY = 100;
      component.lastPanX = 0;
      component.lastPanY = 0;

      const event = new MouseEvent('mousemove', { clientX: 150, clientY: 120 });
      component.onMouseMove(event);

      expect(component.transformChange.emit).toHaveBeenCalledWith({
        panX: 50,
        panY: 20,
        zoom: 1,
      });
    });

    it('should not emit on mouse move when not dragging', () => {
      spyOn(component.transformChange, 'emit');

      component.isDragging = false;
      const event = new MouseEvent('mousemove', { clientX: 150, clientY: 120 });
      component.onMouseMove(event);

      expect(component.transformChange.emit).not.toHaveBeenCalled();
    });

    it('should stop dragging on mouse up', () => {
      component.isDragging = true;
      component.onMouseUp();
      expect(component.isDragging).toBe(false);
    });
  });

  describe('Mouse Interactions - Zoom', () => {
    it('should emit zoom change on wheel with ctrl', () => {
      spyOn(component.transformChange, 'emit');

      component.zoom = 1;
      const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true });
      spyOn(event, 'preventDefault');

      component.onWheel(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.transformChange.emit).toHaveBeenCalled();

      const call = (component.transformChange.emit as jasmine.Spy).calls.mostRecent().args[0];
      expect(call.zoom).toBeGreaterThan(1);
    });

    it('should not zoom without ctrl key', () => {
      spyOn(component.transformChange, 'emit');

      const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: false });
      component.onWheel(event);

      expect(component.transformChange.emit).not.toHaveBeenCalled();
    });

    it('should clamp zoom between 0.1 and 5', () => {
      spyOn(component.transformChange, 'emit');

      // Test max zoom
      component.zoom = 5;
      const eventUp = new WheelEvent('wheel', { deltaY: -1000, ctrlKey: true });
      component.onWheel(eventUp);

      let call = (component.transformChange.emit as jasmine.Spy).calls.mostRecent().args[0];
      expect(call.zoom).toBeLessThanOrEqual(5);

      // Test min zoom
      component.zoom = 0.1;
      const eventDown = new WheelEvent('wheel', { deltaY: 1000, ctrlKey: true });
      component.onWheel(eventDown);

      call = (component.transformChange.emit as jasmine.Spy).calls.mostRecent().args[0];
      expect(call.zoom).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('Click Events', () => {
    it('should emit viewport click with coordinates', () => {
      spyOn(component.viewportClick, 'emit');

      const container = fixture.nativeElement.querySelector('.viewport-container');
      const rect = { left: 10, top: 20 } as DOMRect;
      spyOn(container, 'getBoundingClientRect').and.returnValue(rect);

      const event = new MouseEvent('click', { clientX: 50, clientY: 70 });
      Object.defineProperty(event, 'currentTarget', { value: container, configurable: true });

      component.onViewportClick(event);

      expect(component.viewportClick.emit).toHaveBeenCalledWith({ x: 40, y: 50 });
    });
  });

  describe('Lifecycle', () => {
    it('should reset transform when panel changes', () => {
      spyOn(component, 'resetTransform');

      component.ngOnChanges({
        panel: {
          currentValue: mockPanel,
          previousValue: null,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.resetTransform).toHaveBeenCalled();
    });

    it('should not reset transform when panel is same', () => {
      spyOn(component, 'resetTransform');

      component.ngOnChanges({
        panel: {
          currentValue: mockPanel,
          previousValue: mockPanel,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.resetTransform).not.toHaveBeenCalled();
    });
  });

  describe('Panel Dimensions', () => {
    it('should return default dimensions when no panel', () => {
      component.panel = null;
      const dimensions = component.getPanelDimensions();
      expect(dimensions).toEqual({ width: 0, height: 0 });
    });

    it('should return dimensions when panel exists', () => {
      component.panel = mockPanel;
      const dimensions = component.getPanelDimensions();
      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.height).toBeGreaterThan(0);
    });
  });

  describe('Touch Interactions - Pan', () => {
    it('should start touch pan on single touch', () => {
      const touch = { clientX: 100, clientY: 50 } as Touch;
      const event = { touches: [touch], length: 1 } as unknown as TouchEvent;

      component.onTouchStart(event);

      expect(component.isTouching).toBe(true);
      expect(component.isPinching).toBe(false);
      expect(component.touchStartX).toBe(100);
      expect(component.touchStartY).toBe(50);
    });

    it('should emit transform change on touch move', () => {
      spyOn(component.transformChange, 'emit');

      component.isTouching = true;
      component.touchStartX = 100;
      component.touchStartY = 100;
      component.lastTouchPanX = 0;
      component.lastTouchPanY = 0;

      const touch = { clientX: 150, clientY: 120 } as Touch;
      const event = {
        touches: [touch],
        length: 1,
        preventDefault: jasmine.createSpy('preventDefault'),
      } as unknown as TouchEvent;

      component.onTouchMove(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.transformChange.emit).toHaveBeenCalledWith({
        panX: 50,
        panY: 20,
        zoom: 1,
      });
    });

    it('should stop touching on touch end', () => {
      component.isTouching = true;
      const event = { touches: [] } as unknown as TouchEvent;

      component.onTouchEnd(event);

      expect(component.isTouching).toBe(false);
    });
  });

  describe('Touch Interactions - Pinch Zoom', () => {
    it('should start pinch on two touches', () => {
      const touch1 = { clientX: 100, clientY: 100 } as Touch;
      const touch2 = { clientX: 200, clientY: 200 } as Touch;
      const event = { touches: [touch1, touch2], length: 2 } as unknown as TouchEvent;

      component.onTouchStart(event);

      expect(component.isPinching).toBe(true);
      expect(component.isTouching).toBe(false);
      expect(component.initialPinchDistance).toBeGreaterThan(0);
    });

    it('should calculate pinch distance correctly', () => {
      const touch1 = { clientX: 0, clientY: 0 } as Touch;
      const touch2 = { clientX: 30, clientY: 40 } as Touch;
      const touches = [touch1, touch2] as unknown as TouchList;

      const distance = (component as any).getPinchDistance(touches);

      expect(distance).toBe(50); // 3-4-5 triangle
    });

    it('should emit zoom change on pinch move', () => {
      spyOn(component.transformChange, 'emit');

      component.isPinching = true;
      component.initialPinchDistance = 100;
      component.lastPinchZoom = 1;
      component.zoom = 1;

      const touch1 = { clientX: 0, clientY: 0 } as Touch;
      const touch2 = { clientX: 150, clientY: 200 } as Touch;
      const event = {
        touches: [touch1, touch2],
        length: 2,
        preventDefault: jasmine.createSpy('preventDefault'),
      } as unknown as TouchEvent;

      component.onTouchMove(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.transformChange.emit).toHaveBeenCalled();

      const call = (component.transformChange.emit as jasmine.Spy).calls.mostRecent().args[0];
      expect(call.zoom).toBeGreaterThan(1); // Should be zoomed in
    });

    it('should switch from pinch to pan when one finger lifted', () => {
      component.isPinching = true;
      const touch = { clientX: 100, clientY: 100 } as Touch;
      const event = { touches: [touch], length: 1 } as unknown as TouchEvent;

      component.onTouchEnd(event);

      expect(component.isPinching).toBe(false);
      expect(component.isTouching).toBe(true);
    });
  });
});
