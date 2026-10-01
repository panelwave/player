import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { CanvasStageComponent, CANVAS_PANEL_BUDGET } from './canvas-stage.component';
import { CanvasCameraService } from '../../services/canvas-camera.service';
import { ManifestService } from '../../services/manifest.service';
import { PreloadService } from '../../services/preload.service';
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

  describe('hotspot presses', () => {
    const pointer = (target: EventTarget): PointerEvent =>
      ({ pointerId: 7, clientX: 10, clientY: 10, target } as unknown as PointerEvent);

    it('leaves presses on an interactive hotspot to the hotspot (no capture, no tap)', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'hotspots-svg');
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      shape.setAttribute('class', 'hotspot-shape');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      shape.appendChild(rect);
      svg.appendChild(shape);

      component.onPointerDown(pointer(rect));
      expect((component as unknown as { activePointers: Map<number, unknown> }).activePointers.size).toBe(0);
    });

    it('still tracks presses on render-only hotspots and on the stage itself', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'hotspots-svg non-interactive');
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      shape.setAttribute('class', 'hotspot-shape');
      svg.appendChild(shape);
      // No real pointer exists behind the synthetic event.
      spyOn(fixture.nativeElement as HTMLElement, 'setPointerCapture');

      component.onPointerDown(pointer(shape));
      expect((component as unknown as { activePointers: Map<number, unknown> }).activePointers.size).toBe(1);
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

  describe('locked panels (x-locked)', () => {
    const canvas: CanvasLayout = {
      placements: {
        a: { x: 0, y: 0, w: 1024, h: 576 },
        paid: { x: 1100, y: 0, w: 512, h: 512 },
      },
    };

    it('renders the placeholder instead of layers and bubbles', () => {
      const locked = {
        'x-locked': true,
        layers: [{ kind: 'image', id: 'l1', assetId: 'img-1', z: 0 }],
        speechBubbles: [{ id: 'b1', text: { 'en-US': 'Secret' }, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }],
      } as unknown as Panel;
      component.speechEnabled = true;
      setInputs(canvas, { a: panel(), paid: locked }, 'a');
      const host: HTMLElement = fixture.nativeElement;
      const locks = host.querySelectorAll('.pw-locked-panel');
      expect(locks.length).toBe(1);
      expect(locks[0].closest('[data-panel-id]')?.getAttribute('data-panel-id')).toBe('paid');
      expect(host.querySelector('[data-panel-id="paid"] pw-layer-renderer')).toBeNull();
      expect(host.querySelector('[data-panel-id="paid"] pw-speech-bubbles')).toBeNull();
      expect(host.querySelector('[data-panel-id="paid"] pw-hotspots-overlay')).toBeNull();
    });

    it('renders no placeholder for unlocked panels', () => {
      setInputs(canvas, { a: panel(), paid: panel() }, 'a');
      expect(fixture.nativeElement.querySelector('.pw-locked-panel')).toBeNull();
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

    it('warms out-edge targets with the zoom-appropriate variant on camera settle', () => {
      const preloadService = TestBed.inject(PreloadService);
      const manifestService = TestBed.inject(ManifestService);
      const addSpy = spyOn(preloadService, 'add');
      spyOn(manifestService, 'getAsset').and.returnValue({
        id: 'img-next',
        category: 'image',
        variants: [
          { src: 'thumb.jpg', w: 256, h: 144 },
          { src: 'full.jpg', w: 2048, h: 1152 },
        ],
      } as never);

      const canvas: CanvasLayout = {
        placements: {
          a: { x: 0, y: 0, w: 1024, h: 576 },
          b: { x: 0, y: 1200, w: 1024, h: 576 },
        },
      };
      const panels: Record<string, Panel> = {
        a: { layers: [] } as Panel,
        b: { layers: [{ id: 'bg', kind: 'image', assetId: 'img-next' }] } as unknown as Panel,
      };
      component.graph = { entry: 'a', edges: [{ from: 'a', to: 'b' }] };
      setInputs(canvas, panels, 'a');
      camera.setViewportSize(1000, 1000);
      camera.jumpTo({ x: 512, y: 288, zoom: 0.2 });

      // Trigger the settle path directly (the 180ms debounce is timing glue).
      (component as unknown as { onCameraSettled(): void }).onCameraSettled();

      expect(addSpy).toHaveBeenCalled();
      const item = addSpy.calls.mostRecent().args[0];
      expect(item.priority).toBe('high');
      expect(item.panelId).toBe('b');
      // 1024 wu at zoom 0.2 (× dpr 1) needs ~205px -> quantized 256 -> thumb
      expect(item.url).toBe('thumb.jpg');
    });

    it('variant widths only ever upgrade while a panel stays mounted', () => {
      const { canvas, panels } = columnLayout(2);
      setInputs(canvas, panels, 'p0');
      camera.setViewportSize(1000, 1000);

      camera.jumpTo({ x: 512, y: 288, zoom: 1 });
      (component as unknown as { onCameraSettled(): void }).onCameraSettled();
      const atZoom1 = component.targetWidthFor('p0');
      expect(atZoom1).toBeGreaterThan(0);

      camera.jumpTo({ x: 512, y: 288, zoom: 0.1 });
      (component as unknown as { onCameraSettled(): void }).onCameraSettled();
      expect(component.targetWidthFor('p0')).toBe(atZoom1);

      camera.jumpTo({ x: 512, y: 288, zoom: 2 });
      (component as unknown as { onCameraSettled(): void }).onCameraSettled();
      expect(component.targetWidthFor('p0')).toBeGreaterThan(atZoom1);
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
