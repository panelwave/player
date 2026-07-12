/**
 * Unit tests for ViewportComponent
 * Tests for Phases 1-5: Flexible positioning, rotation, focus, performance
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ViewportComponent, PerformanceMetrics } from './viewport.component';
import type { Panel, Page, PanelPlacement } from '../../types';

describe('ViewportComponent', () => {
  let component: ViewportComponent;
  let fixture: ComponentFixture<ViewportComponent>;

  const mockPanel: Panel = {
    title: { 'en-US': 'Test Panel' },
    layers: [
      { kind: 'image', id: 'layer-1', assetId: 'img-1', z: 0 },
      { kind: 'text', id: 'layer-2', text: { 'en-US': 'Test' }, x: 100, y: 100, z: 1 },
    ],
  };

  const mockPage: Page = {
    id: 'page-1',
    title: { 'en-US': 'Test Page' },
    layout: {
      format: 'bigscreen-landscape',
      canvasSize: { width: 3840, height: 2160 },
      gridHelper: { cols: 12, rows: 8, visible: true, snapEnabled: true, snapDistance: 0.01 },
      placements: [
        { panelId: 'p1', x: 0.0, y: 0.0, w: 0.5, h: 0.5, z: 0, r: 0 },
        { panelId: 'p2', x: 0.5, y: 0.0, w: 0.5, h: 0.5, z: 1, r: 0 },
        { panelId: 'p3', x: 0.0, y: 0.5, w: 0.5, h: 0.5, z: 2, r: 45 },
      ],
    },
    readingOrder: ['p1', 'p2', 'p3'],
  };

  const mockPanels: Record<string, Panel> = {
    'p1': { title: { 'en-US': 'Panel 1' }, layers: [] },
    'p2': { title: { 'en-US': 'Panel 2' }, layers: [] },
    'p3': { title: { 'en-US': 'Panel 3' }, layers: [] },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewportComponent],
      providers: [provideHttpClient()],
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
      fixture.componentRef.setInput('panel', mockPanel);
      fixture.detectChanges();
      await fixture.whenStable();

      const panelContainer = fixture.nativeElement.querySelector('.panel-container');
      expect(panelContainer).toBeTruthy();
    });

    it('should render all layers', async () => {
      fixture.componentRef.setInput('panel', mockPanel);
      fixture.detectChanges();
      await fixture.whenStable();

      const layers = fixture.nativeElement.querySelectorAll('pw-layer-renderer');
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
      // First translate centers the panel, then pan/zoom apply
      expect(transform).toBe('translate(-50%, -50%) translate(10px, 20px) scale(1.5)');
    });

    it('should return centered identity transform in reduced motion mode', () => {
      component.reducedMotion = true;
      component.panX = 10;
      component.panY = 20;
      component.zoom = 1.5;

      const transform = component.getTransformStyle();
      expect(transform).toBe('translate(-50%, -50%) scale(1)');
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
      const event = new MouseEvent('mouseup');
      component.onMouseUp(event);
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

  describe('Panel-change transitions (manifest edge transitions)', () => {
    const otherPanel: Panel = { title: { 'en-US': 'Other Panel' }, layers: [] };

    const panelChange = (previousValue: Panel | null, currentValue: Panel | null) => ({
      panel: {
        currentValue,
        previousValue,
        firstChange: false,
        isFirstChange: () => false,
      },
      currentPanelId: {
        currentValue: 'p-new',
        previousValue: 'p-old',
        firstChange: false,
        isFirstChange: () => false,
      },
    });

    describe('getTransitionAnimationClasses', () => {
      it('should map fade and zoom to enter-only animations', () => {
        expect(component.getTransitionAnimationClasses({ type: 'fade' }))
          .toEqual({ enter: 't-fade-in', leave: '' });
        expect(component.getTransitionAnimationClasses({ type: 'zoom' }))
          .toEqual({ enter: 't-zoom-in', leave: '' });
      });

      it('should move both panels for slide/push (dir = direction of motion)', () => {
        expect(component.getTransitionAnimationClasses({ type: 'slide', dir: 'left' }))
          .toEqual({ enter: 't-from-right', leave: 't-to-left' });
        expect(component.getTransitionAnimationClasses({ type: 'push', dir: 'right' }))
          .toEqual({ enter: 't-from-left', leave: 't-to-right' });
        expect(component.getTransitionAnimationClasses({ type: 'slide', dir: 'up' }))
          .toEqual({ enter: 't-from-bottom', leave: 't-to-top' });
        expect(component.getTransitionAnimationClasses({ type: 'slide', dir: 'down' }))
          .toEqual({ enter: 't-from-top', leave: 't-to-bottom' });
      });

      it('should default the slide direction to left', () => {
        expect(component.getTransitionAnimationClasses({ type: 'slide' }))
          .toEqual({ enter: 't-from-right', leave: 't-to-left' });
      });

      it('should slide the new panel over a static old one for cover', () => {
        expect(component.getTransitionAnimationClasses({ type: 'cover', dir: 'left' }))
          .toEqual({ enter: 't-from-right', leave: '' });
      });

      it('should return null for cut, none, and missing transitions', () => {
        expect(component.getTransitionAnimationClasses({ type: 'cut' })).toBeNull();
        expect(component.getTransitionAnimationClasses({ type: 'none' })).toBeNull();
        expect(component.getTransitionAnimationClasses(null)).toBeNull();
        expect(component.getTransitionAnimationClasses(undefined)).toBeNull();
      });
    });

    describe('transition lifecycle', () => {
      beforeEach(() => {
        jasmine.clock().install();
      });

      afterEach(() => {
        jasmine.clock().uninstall();
      });

      it('should keep the outgoing panel in the leave frame for the transition duration', () => {
        component.transition = { type: 'slide', dir: 'left', durationMs: 250, easing: 'ease-out' };
        component.panel = otherPanel;
        component.ngOnChanges(panelChange(mockPanel, otherPanel));

        expect(component.leavingPanel).toBe(mockPanel);
        expect(component.leavingPanelId).toBe('p-old');
        expect(component.enterAnimationClass).toBe('t-from-right');
        expect(component.leaveAnimationClass).toBe('t-to-left');
        expect(component.transitionDuration).toBe('250ms');
        expect(component.transitionEasing).toBe('ease-out');

        jasmine.clock().tick(251);

        expect(component.leavingPanel).toBeNull();
        expect(component.enterAnimationClass).toBe('');
        expect(component.leaveAnimationClass).toBe('');
      });

      it('should default duration to 400ms and easing to ease', () => {
        component.transition = { type: 'fade' };
        component.ngOnChanges(panelChange(mockPanel, otherPanel));

        expect(component.transitionDuration).toBe('400ms');
        expect(component.transitionEasing).toBe('ease');
      });

      it('should swap instantly without a transition', () => {
        component.transition = null;
        component.ngOnChanges(panelChange(mockPanel, otherPanel));

        expect(component.leavingPanel).toBeNull();
        expect(component.enterAnimationClass).toBe('');
      });

      it('should swap instantly for cut transitions', () => {
        component.transition = { type: 'cut' };
        component.ngOnChanges(panelChange(mockPanel, otherPanel));

        expect(component.leavingPanel).toBeNull();
      });

      it('should swap instantly under reduced motion', () => {
        component.reducedMotion = true;
        component.transition = { type: 'slide', dir: 'left' };
        component.ngOnChanges(panelChange(mockPanel, otherPanel));

        expect(component.leavingPanel).toBeNull();
      });

      it('should not animate the very first panel (no previous value)', () => {
        component.transition = { type: 'fade' };
        component.ngOnChanges(panelChange(null, mockPanel));

        expect(component.leavingPanel).toBeNull();
      });

      it('should replace a running transition when navigating again mid-flight', () => {
        component.transition = { type: 'slide', dir: 'left', durationMs: 300 };
        component.ngOnChanges(panelChange(mockPanel, otherPanel));
        expect(component.leavingPanel).toBe(mockPanel);

        jasmine.clock().tick(150);
        component.ngOnChanges(panelChange(otherPanel, mockPanel));
        expect(component.leavingPanel).toBe(otherPanel);

        jasmine.clock().tick(301);
        expect(component.leavingPanel).toBeNull();
      });

      it('should render the leave frame while a transition runs', () => {
        fixture.componentRef.setInput('panel', mockPanel);
        fixture.componentRef.setInput('currentPanelId', 'p-old');
        fixture.detectChanges();

        fixture.componentRef.setInput('transition', { type: 'push', dir: 'left', durationMs: 300 });
        fixture.componentRef.setInput('panel', otherPanel);
        fixture.componentRef.setInput('currentPanelId', 'p-new');
        fixture.detectChanges();

        const leaveFrame = fixture.nativeElement.querySelector('.t-frame-leave');
        expect(leaveFrame).toBeTruthy();
        expect(leaveFrame.className).toContain('t-to-left');
        expect(component.leavingPanelId).toBe('p-old');

        const enterFrame = fixture.nativeElement.querySelector('.t-frame');
        expect(enterFrame.className).toContain('t-from-right');

        jasmine.clock().tick(301);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.t-frame-leave')).toBeFalsy();
      });
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
      const event = { touches: [], changedTouches: [] } as unknown as TouchEvent;

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

      const distance = (component as unknown as { getPinchDistance: (touches: TouchList) => number }).getPinchDistance(touches);

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
      const event = { touches: [touch], changedTouches: [], length: 1 } as unknown as TouchEvent;

      component.onTouchEnd(event);

      expect(component.isPinching).toBe(false);
      expect(component.isTouching).toBe(true);
    });
  });

  // ======================
  // PHASE 1: Flexible Positioning & Z-Index
  // ======================

  describe('Phase 1: Flexible Positioning', () => {
    beforeEach(() => {
      component.page = mockPage;
      component.panels = mockPanels;
      component.viewMode = 'page';
    });

    it('should convert normalized values to percentages', () => {
      expect(component.toPercent(0)).toBe(0);
      expect(component.toPercent(0.5)).toBe(50);
      expect(component.toPercent(1.0)).toBe(100);
      expect(component.toPercent(0.3333)).toBe(33.33);
    });

    it('should sort panels by z-index (lowest to highest)', () => {
      const sorted = component.getSortedPanels();
      
      expect(sorted.length).toBe(3);
      expect(sorted[0].panelId).toBe('p1'); // z=0
      expect(sorted[1].panelId).toBe('p2'); // z=1
      expect(sorted[2].panelId).toBe('p3'); // z=2
    });

    it('should handle panels with no z-index (default to 0)', () => {
      component.page = {
        ...mockPage,
        layout: {
          ...mockPage.layout,
          placements: [
            { panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5 }, // No z specified
            { panelId: 'p2', x: 0.5, y: 0, w: 0.5, h: 0.5, z: 1 },
          ],
        },
      };

      const sorted = component.getSortedPanels();
      expect(sorted[0].z || 0).toBe(0);
      expect(sorted[1].z).toBe(1);
    });

    it('should get panel by ID', () => {
      const panel = component.getPanel('p1');
      expect(panel).toBeTruthy();
      expect(panel?.title?.['en-US']).toBe('Panel 1');
    });

    it('should warn when panel not found', () => {
      spyOn(console, 'warn');
      const panel = component.getPanel('nonexistent');
      
      expect(panel).toBeUndefined();
      expect(console.warn).toHaveBeenCalledWith('Panel not found: nonexistent');
    });
  });

  // ======================
  // PHASE 2: Rotation & Hit Testing
  // ======================

  describe('Phase 2: Rotation Support', () => {
    it('should return none transform for non-rotated panels', () => {
      const placement: PanelPlacement = {
        panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5, z: 0, r: 0
      };

      const transform = component.getPanelTransform(placement);
      expect(transform).toBe('none');
    });

    it('should return rotate transform for rotated panels', () => {
      const placement: PanelPlacement = {
        panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5, z: 0, r: 45
      };

      const transform = component.getPanelTransform(placement);
      expect(transform).toBe('rotate(45deg)');
    });

    it('should handle negative rotation', () => {
      const placement: PanelPlacement = {
        panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5, z: 0, r: -30
      };

      const transform = component.getPanelTransform(placement);
      expect(transform).toBe('rotate(-30deg)');
    });

    it('should return default transform origin when not specified', () => {
      const placement: PanelPlacement = {
        panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5
      };

      const origin = component.getTransformOrigin(placement);
      expect(origin).toBe('center center');
    });

    it('should calculate custom transform origin', () => {
      const placement: PanelPlacement = {
        panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5,
        origin: { x: 0.25, y: 0.75 }
      };

      const origin = component.getTransformOrigin(placement);
      expect(origin).toBe('25% 75%');
    });

    it('should handle top-left origin', () => {
      const placement: PanelPlacement = {
        panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5,
        origin: { x: 0, y: 0 }
      };

      const origin = component.getTransformOrigin(placement);
      expect(origin).toBe('0% 0%');
    });
  });

  // ======================
  // PHASE 4: Focus & Navigation
  // ======================

  describe('Phase 4: Focus Management', () => {
    beforeEach(() => {
      component.page = mockPage;
      component.panels = mockPanels;
      component.viewMode = 'page';
    });

    it('should set focus on a panel', () => {
      spyOn(component.panelFocus, 'emit');
      
      component.focusPanel('p2');

      expect(component.focusedPanelId).toBe('p2');
      expect(component.focusedPanelIndex).toBe(1); // Second in reading order
      expect(component.panelFocus.emit).toHaveBeenCalledWith('p2');
    });

    it('should clear focus when null passed', () => {
      component.focusedPanelId = 'p1';
      component.focusedPanelIndex = 0;

      component.focusPanel(null);

      expect(component.focusedPanelId).toBeNull();
      expect(component.focusedPanelIndex).toBe(-1);
    });

    it('should check if panel is focused', () => {
      component.focusedPanelId = 'p1';

      expect(component.isPanelFocused('p1')).toBe(true);
      expect(component.isPanelFocused('p2')).toBe(false);
    });

    it('should navigate forward with Tab', () => {
      component.focusPanel('p1');

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      spyOn(event, 'preventDefault');
      
      component.onKeydownTab(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.focusedPanelId).toBe('p2');
    });

    it('should navigate backward with Shift+Tab', () => {
      component.focusPanel('p2');

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      spyOn(event, 'preventDefault');
      
      component.onKeydownTab(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.focusedPanelId).toBe('p1');
    });

    it('should wrap around when reaching end with Tab', () => {
      component.focusPanel('p3'); // Last panel

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      spyOn(event, 'preventDefault');
      
      component.onKeydownTab(event);

      expect(component.focusedPanelId).toBe('p1'); // Wrap to first
    });

    it('should wrap around when reaching start with Shift+Tab', () => {
      component.focusPanel('p1'); // First panel

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      spyOn(event, 'preventDefault');
      
      component.onKeydownTab(event);

      expect(component.focusedPanelId).toBe('p3'); // Wrap to last
    });

    it('should navigate forward with arrow keys', () => {
      component.focusPanel('p1');

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      spyOn(event, 'preventDefault');
      
      component.onKeydownNext(event);

      expect(component.focusedPanelId).toBe('p2');
    });

    it('should navigate backward with arrow keys', () => {
      component.focusPanel('p2');

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      spyOn(event, 'preventDefault');
      
      component.onKeydownPrevious(event);

      expect(component.focusedPanelId).toBe('p1');
    });
  });

  // ======================
  // PHASE 5: Performance
  // ======================

  describe('Phase 5: Performance Optimization', () => {
    it('should return lazy loading strategy when enabled', () => {
      component.enableLazyLoading = true;
      expect(component.getImageLoadingStrategy()).toBe('lazy');
    });

    it('should return eager loading strategy when disabled', () => {
      component.enableLazyLoading = false;
      expect(component.getImageLoadingStrategy()).toBe('eager');
    });

    it('should return true for all panels when culling disabled', () => {
      component.enableViewportCulling = false;
      
      const placement: PanelPlacement = {
        panelId: 'p1', x: 2.0, y: 2.0, w: 0.5, h: 0.5 // Way off screen
      };

      expect(component.isPanelVisible(placement)).toBe(true);
    });

    it('should measure performance', () => {
      component.startPerformanceMeasurement();
      expect(component['performanceStartTime']).toBeGreaterThan(0);
    });

    it('should emit performance metrics', () => {
      spyOn(component.performanceMetrics, 'emit');
      
      component.page = mockPage;
      component.startPerformanceMeasurement();
      
      // Simulate some work
      const start = performance.now();
      while (performance.now() - start < 5) { /* wait 5ms */ }
      
      component.endPerformanceMeasurement();

      expect(component.performanceMetrics.emit).toHaveBeenCalled();
      
      const metrics: PerformanceMetrics = (component.performanceMetrics.emit as jasmine.Spy).calls.mostRecent().args[0];
      expect(metrics.renderTime).toBeGreaterThan(0);
      expect(metrics.panelCount).toBe(3);
    });

    it('should measure transform performance', () => {
      const duration = component.measureTransformPerformance(() => {
        // Simulate calculation
        Math.sqrt(12345);
      });

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should get performance stats', () => {
      component['renderCount'] = 5;
      component['visiblePanels'].add('p1');
      component['visiblePanels'].add('p2');

      const stats = component.getPerformanceStats();

      expect(stats.totalRenders).toBe(5);
      expect(stats.visiblePanelCount).toBe(2);
    });

    it('should profile memory when available', () => {
      const memory = component.profileMemory();
      
      // Memory API may not be available in test environment
      expect(memory).toBeDefined();
    });

    it('should log performance metrics to console', () => {
      spyOn(console, 'group');
      spyOn(console, 'log');
      spyOn(console, 'groupEnd');

      component.logPerformanceMetrics();

      expect(console.group).toHaveBeenCalledWith('[Performance Metrics]');
      expect(console.groupEnd).toHaveBeenCalled();
    });
  });

  // ======================
  // Integration Tests
  // ======================

  describe('Integration: Full Page Workflow', () => {
    it('should render page with all panels', () => {
      component.page = mockPage;
      component.panels = mockPanels;
      component.viewMode = 'page';
      fixture.detectChanges();

      const panels = component.getSortedPanels();
      expect(panels.length).toBe(3);
    });

    it('should handle focus and keyboard navigation in sequence', () => {
      component.page = mockPage;
      component.panels = mockPanels;
      component.viewMode = 'page';

      // Start with first panel
      component.focusPanel('p1');
      expect(component.focusedPanelId).toBe('p1');

      // Tab to next
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
      spyOn(tabEvent, 'preventDefault');
      component.onKeydownTab(tabEvent);
      expect(component.focusedPanelId).toBe('p2');

      // Tab to next
      component.onKeydownTab(tabEvent);
      expect(component.focusedPanelId).toBe('p3');

      // Tab wraps around
      component.onKeydownTab(tabEvent);
      expect(component.focusedPanelId).toBe('p1');
    });

    it('should handle panel with rotation and custom origin', () => {
      const placement: PanelPlacement = {
        panelId: 'hero',
        x: 0.25, y: 0.25, w: 0.5, h: 0.5,
        z: 10, r: 45,
        origin: { x: 0.5, y: 0.5 }
      };

      expect(component.getPanelTransform(placement)).toBe('rotate(45deg)');
      expect(component.getTransformOrigin(placement)).toBe('50% 50%');
    });
  });

  // ======================
  // Accessibility Tests
  // ======================

  describe('Accessibility', () => {
    beforeEach(() => {
      component.page = mockPage;
      component.panels = mockPanels;
      component.viewMode = 'page';
    });

    it('should follow reading order for keyboard navigation', () => {
      // Reading order should be p1, p2, p3 regardless of z-index
      expect(mockPage.readingOrder).toEqual(['p1', 'p2', 'p3']);

      component.focusPanel('p1');
      
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      spyOn(event, 'preventDefault');
      
      component.onKeydownTab(event);
      expect(component.focusedPanelId).toBe('p2'); // Follows reading order, not z-index
    });

    it('should emit focus events for screen readers', () => {
      spyOn(component.panelFocus, 'emit');
      
      component.focusPanel('p2');

      expect(component.panelFocus.emit).toHaveBeenCalledWith('p2');
    });

    it('should support keyboard navigation in page view only', () => {
      component.viewMode = 'panel';
      
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      spyOn(event, 'preventDefault');
      
      component.onKeydownTab(event);

      // Should not prevent default in panel view
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  // ======================
  // Edge Cases & Error Handling
  // ======================

  describe('Edge Cases', () => {
    it('should handle empty page placements', () => {
      component.page = {
        ...mockPage,
        layout: { ...mockPage.layout, placements: [] },
      };

      const sorted = component.getSortedPanels();
      expect(sorted.length).toBe(0);
    });

    it('should handle null page', () => {
      component.page = null;
      
      const sorted = component.getSortedPanels();
      expect(sorted.length).toBe(0);
    });

    it('should handle focus on non-existent panel', () => {
      component.focusPanel('nonexistent');
      
      expect(component.focusedPanelId).toBe('nonexistent');
      expect(component.focusedPanelIndex).toBe(-1);
    });

    it('should handle 0 rotation as non-rotated', () => {
      const placement: PanelPlacement = {
        panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5, r: 0
      };

      expect(component.getPanelTransform(placement)).toBe('none');
    });

    it('should handle undefined rotation as non-rotated', () => {
      const placement: PanelPlacement = {
        panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5
      };

      expect(component.getPanelTransform(placement)).toBe('none');
    });
  });
});
