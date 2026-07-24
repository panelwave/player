import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { CanvasStageComponent, CANVAS_PANEL_BUDGET } from './canvas-stage.component';
import { CanvasCameraService } from '../../services/canvas-camera.service';
import type { CanvasLayout, Panel } from '../../types';

describe('CanvasStageComponent', () => {
  let fixture: ComponentFixture<CanvasStageComponent>;
  let component: CanvasStageComponent;
  let camera: CanvasCameraService;

  const panel = (): Panel => ({ layers: [] } as Panel);

  /** A vertical strip of `count` panels, one viewport apart. */
  const columnLayout = (count: number): { canvas: CanvasLayout; panels: Record<string, Panel> } => {
    const placements: CanvasLayout['placements'] = {};
    const panels: Record<string, Panel> = {};
    for (let i = 0; i < count; i++) {
      placements[`p${i}`] = { x: 0, y: i * 1200, w: 1024, h: 576 };
      panels[`p${i}`] = panel();
    }
    return { canvas: { placements }, panels };
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CanvasStageComponent],
      providers: [provideHttpClient(), CanvasCameraService],
    }).compileComponents();

    fixture = TestBed.createComponent(CanvasStageComponent);
    component = fixture.componentInstance;
    camera = TestBed.inject(CanvasCameraService);
  });

  function setInputs(canvas: CanvasLayout, panels: Record<string, Panel>, currentPanelId: string): void {
    component.canvas = canvas;
    component.panels = panels;
    component.currentPanelId = currentPanelId;
    component.ngOnChanges({
      canvas: { currentValue: canvas, previousValue: null, firstChange: true, isFirstChange: () => true },
    });
    fixture.detectChanges();
  }

  describe('virtualization', () => {
    it('mounts only panels near the camera, capped at the budget', () => {
      const { canvas, panels } = columnLayout(100);
      setInputs(canvas, panels, 'p0');

      expect(component.stagePlacements.length).toBeLessThanOrEqual(CANVAS_PANEL_BUDGET);
      // Nearest panels first — the current panel is always included.
      expect(component.stagePlacements.some((p) => p.panelId === 'p0')).toBeTrue();
      // Panels 50 viewports away are not mounted.
      expect(component.stagePlacements.some((p) => p.panelId === 'p50')).toBeFalse();
    });

    it('always includes the current panel even when the camera is far away', () => {
      const { canvas, panels } = columnLayout(50);
      setInputs(canvas, panels, 'p49');
      // Camera parked at the top, current panel at the bottom.
      camera.jumpTo({ x: 512, y: 0, zoom: 1 });

      expect(component.stagePlacements.some((p) => p.panelId === 'p49')).toBeTrue();
    });
  });

  describe('reveal modes', () => {
    it('keeps on-visit panels veiled until visited', () => {
      const canvas: CanvasLayout = {
        placements: {
          a: { x: 0, y: 0, w: 1024, h: 576 },
          secret: { x: 1200, y: 0, w: 512, h: 512, revealMode: 'on-visit' },
        },
      };
      const panels = { a: panel(), secret: panel() };
      setInputs(canvas, panels, 'a');

      const secret = component.stagePlacements.find((p) => p.panelId === 'secret');
      expect(secret).toBeDefined();
      expect(secret!.revealed).toBeFalse();

      // Visiting reveals it.
      component.visitedPanelIds = ['a', 'secret'];
      component.ngOnChanges({});
      const revealed = component.stagePlacements.find((p) => p.panelId === 'secret');
      expect(revealed!.revealed).toBeTrue();
    });

    it('reveals on-approach panels once the camera nears them', () => {
      const canvas: CanvasLayout = {
        placements: {
          a: { x: 0, y: 0, w: 1024, h: 576 },
          teaser: { x: 400, y: 300, w: 512, h: 512, revealMode: 'on-approach' },
        },
      };
      setInputs(canvas, { a: panel(), teaser: panel() }, 'a');
      // Camera framed on 'a' overlaps the teaser -> approached.
      const teaser = component.stagePlacements.find((p) => p.panelId === 'teaser');
      expect(teaser!.revealed).toBeTrue();
    });
  });

  describe('hit testing', () => {
    it('maps a screen point to the topmost placement (z order)', () => {
      const canvas: CanvasLayout = {
        placements: {
          below: { x: 0, y: 0, w: 1000, h: 1000, z: 0 },
          above: { x: 250, y: 250, w: 500, h: 500, z: 5 },
        },
      };
      setInputs(canvas, { below: panel(), above: panel() }, 'below');
      camera.setViewportSize(1000, 1000);
      camera.jumpTo({ x: 500, y: 500, zoom: 1 });
      component.ngOnChanges({});

      // Screen center = world (500, 500) -> inside both, 'above' wins.
      expect(component.panelAtScreenPoint(500, 500)).toBe('above');
      // Screen (60, 60) -> world (60, 60) -> only 'below'.
      expect(component.panelAtScreenPoint(60, 60)).toBe('below');
    });

    it('hit-tests rotated placements in their rotated frame', () => {
      const canvas: CanvasLayout = {
        placements: {
          rot: { x: 0, y: 0, w: 400, h: 100, r: 90 },
        },
      };
      setInputs(canvas, { rot: panel() }, 'rot');
      camera.setViewportSize(1000, 1000);
      camera.jumpTo({ x: 200, y: 50, zoom: 1 });
      component.ngOnChanges({});

      // Rotated 90° around its center (200, 50): the world point (200, 50)
      // stays inside; the unrotated far corner (390, 50) is now outside.
      expect(component.panelAtScreenPoint(500, 500)).toBe('rot');
      expect(component.panelAtScreenPoint(690, 500)).toBeNull();
    });
  });

  describe('rendering', () => {
    it('renders veiled panels without their layers', () => {
      const canvas: CanvasLayout = {
        placements: {
          a: { x: 0, y: 0, w: 1024, h: 576 },
          secret: { x: 1100, y: 0, w: 512, h: 512, revealMode: 'on-visit' },
        },
      };
      setInputs(canvas, { a: panel(), secret: panel() }, 'a');
      const host: HTMLElement = fixture.nativeElement;
      const veils = host.querySelectorAll('.canvas-panel-veil');
      expect(veils.length).toBe(1);
    });

    it('marks non-current panels aria-hidden and inert', () => {
      const { canvas, panels } = columnLayout(3);
      setInputs(canvas, panels, 'p0');
      // Zoom out far enough that all three panels mount.
      camera.setViewportSize(2000, 2000);
      camera.jumpTo({ x: 512, y: 1800, zoom: 0.4 });
      fixture.detectChanges();
      const host: HTMLElement = fixture.nativeElement;
      const nodes = host.querySelectorAll('.canvas-panel');
      expect(nodes.length).toBeGreaterThan(1);
      nodes.forEach((node) => {
        const isCurrent = node.getAttribute('data-panel-id') === 'p0';
        if (isCurrent) {
          expect(node.getAttribute('aria-hidden')).toBeNull();
        } else {
          expect(node.getAttribute('aria-hidden')).toBe('true');
          expect(node.hasAttribute('inert')).toBeTrue();
        }
      });
    });
  });
});
