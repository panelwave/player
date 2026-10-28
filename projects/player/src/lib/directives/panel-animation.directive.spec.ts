import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { PanelAnimations } from '../types';
import { PanelAnimationDirective } from './panel-animation.directive';

@Component({
  imports: [PanelAnimationDirective],
  template: `
    <div
      class="panel"
      style="width: 400px; height: 300px; position: relative;"
      [pwPanelAnimation]="animations"
      [pwPanelAnimationKey]="key"
      [pwPanelAnimationReducedMotion]="reducedMotion"
      [pwPanelAnimationStatic]="isStatic">
      <div class="pw-panel-camera">
        <div data-layer-id="l1" class="layer"></div>
        <div data-layer-id="l2" class="layer"></div>
        <div data-layer-id="l3" class="layer" style="opacity: 0.4;"></div>
      </div>
    </div>
  `,
})
class HostComponent {
  animations: PanelAnimations | null = null;
  key = 'p1';
  reducedMotion = false;
  isStatic = false;
}

describe('PanelAnimationDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let observerCallback: IntersectionObserverCallback | null;
  let originalObserver: typeof IntersectionObserver;

  const layer = (id: string): HTMLElement =>
    fixture.nativeElement.querySelector(`[data-layer-id="${id}"]`) as HTMLElement;

  /** Horizontal offset in px (browsers serialize "translate: -200px 0px" as "-200px"). */
  const translateX = (id: string): number =>
    parseFloat(layer(id).style.getPropertyValue('translate').split(' ')[0]);

  /** Run the pending animation frame(s) as if `timestamp` ms had passed. */
  const flushFrame = (timestamp: number): void => {
    const pending = [...frames.entries()];
    frames.clear();
    pending.forEach(([, cb]) => cb(timestamp));
  };

  const panel = (): HTMLElement => fixture.nativeElement.querySelector('.panel') as HTMLElement;
  const camera = (): HTMLElement => fixture.nativeElement.querySelector('.pw-panel-camera') as HTMLElement;

  const setVisible = (visible: boolean): void => {
    observerCallback?.(
      [
        {
          isIntersecting: visible,
          intersectionRatio: visible ? 1 : 0,
          intersectionRect: { width: visible ? 400 : 0, height: visible ? 300 : 0 } as DOMRectReadOnly,
          rootBounds: { width: 1000, height: 800 } as DOMRectReadOnly,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    );
  };

  const fade: PanelAnimations = {
    durationMs: 1000,
    keyframes: [
      { layerId: 'l1', property: 'opacity', timeMs: 0, value: 0 },
      { layerId: 'l1', property: 'opacity', timeMs: 1000, value: 1 },
      { layerId: 'l1', property: 'transform.x', timeMs: 0, value: -0.5 },
      { layerId: 'l1', property: 'transform.x', timeMs: 1000, value: 0 },
    ],
  };

  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    observerCallback = null;
    spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.set(id, cb);
      return id;
    });
    spyOn(window, 'cancelAnimationFrame').and.callFake((id: number) => {
      frames.delete(id);
    });
    originalObserver = window.IntersectionObserver;
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
      observe(): void { /* driven by setVisible() */ }
      disconnect(): void { observerCallback = null; }
    };

    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = originalObserver;
  });

  it('does nothing without keyframes or a camera move', () => {
    host.animations = { durationMs: 1000 };
    fixture.detectChanges();
    expect(frames.size).toBe(0);
    expect(layer('l1').style.opacity).toBe('');
    expect(panel().style.overflow).toBe('');
  });

  it('clips the panel box while an animation is attached', () => {
    host.animations = fade;
    fixture.detectChanges();
    expect(panel().style.overflow).toBe('hidden');

    host.animations = null;
    fixture.detectChanges();
    expect(panel().style.overflow).toBe('');
  });

  it('keeps the inline styles of a layer for properties that are not animated', () => {
    // l3 carries its own opacity (0.4); only its offset is animated.
    host.animations = {
      durationMs: 1000,
      keyframes: [
        { layerId: 'l3', property: 'transform.x', timeMs: 0, value: 0.25 },
        { layerId: 'l3', property: 'transform.x', timeMs: 1000, value: 0 },
      ],
    };
    fixture.detectChanges();
    setVisible(true);
    flushFrame(0);
    flushFrame(200);
    expect(layer('l3').style.opacity).toBe('0.4');
    expect(translateX('l3')).toBe(80);
  });

  it('gives a layer its own opacity back when the animation is detached', () => {
    host.animations = {
      durationMs: 1000,
      keyframes: [
        { layerId: 'l3', property: 'opacity', timeMs: 0, value: 0 },
        { layerId: 'l3', property: 'opacity', timeMs: 1000, value: 1 },
      ],
    };
    fixture.detectChanges();
    flushFrame(0);
    expect(layer('l3').style.opacity).toBe('0');

    host.animations = null;
    fixture.detectChanges();
    expect(layer('l3').style.opacity).toBe('0.4');
  });

  describe('camera move', () => {
    // Push in from the whole panel to its middle half (scale 2) over 1 s.
    const pushIn: PanelAnimations = {
      startViewportRect: { x: 0, y: 0, w: 1, h: 1 },
      endViewportRect: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      durationMs: 1000,
    };

    it('transforms the camera element from the start rect to the end rect', () => {
      host.animations = pushIn;
      fixture.detectChanges();
      expect(panel().style.overflow).toBe('hidden');

      flushFrame(0); // start state: the whole panel, no transform
      expect(camera().style.transform).toBe('');

      setVisible(true);
      flushFrame(100);
      flushFrame(350);
      flushFrame(600); // 500 ms in: rect 0.125 / 0.125 / 0.75 / 0.75 -> scale 4/3
      expect(camera().style.transform).toBe('translate(-66.67px, -50px) scale(1.3333)');
      expect(camera().style.transformOrigin).toContain('0');

      flushFrame(850);
      flushFrame(1100);
      flushFrame(1200); // done: middle half of the 400 x 300 panel
      expect(camera().style.transform).toBe('translate(-200px, -150px) scale(2)');
      expect(frames.size).toBe(0);
    });

    it('runs together with layer keyframes on one timeline', () => {
      host.animations = { ...pushIn, keyframes: fade.keyframes };
      fixture.detectChanges();
      setVisible(true);
      flushFrame(0);
      flushFrame(250);
      flushFrame(500);
      expect(Number(layer('l1').style.opacity)).toBeCloseTo(0.5, 2);
      expect(camera().style.transform).toBe('translate(-66.67px, -50px) scale(1.3333)');
    });

    it('shows the end rect at once for reduced motion', () => {
      host.animations = pushIn;
      host.reducedMotion = true;
      fixture.detectChanges();
      flushFrame(0);
      expect(camera().style.transform).toBe('translate(-200px, -150px) scale(2)');
      expect(frames.size).toBe(0);
    });

    it('shows a framing without a duration (static zoom)', () => {
      host.animations = { endViewportRect: { x: 0.5, y: 0, w: 0.5, h: 0.5 } };
      fixture.detectChanges();
      flushFrame(0);
      expect(camera().style.transform).toBe('translate(-400px, 0px) scale(2)');
    });

    it('resets the camera when the animation is detached', () => {
      host.animations = pushIn;
      host.reducedMotion = true;
      fixture.detectChanges();
      flushFrame(0);
      host.animations = null;
      fixture.detectChanges();
      expect(camera().style.transform).toBe('');
      expect(panel().style.overflow).toBe('');
    });
  });

  it('holds the end state without playing when static (outgoing panel)', () => {
    host.animations = fade;
    host.isStatic = true;
    fixture.detectChanges();
    flushFrame(0);
    expect(layer('l1').style.opacity).toBe('1');
    expect(translateX('l1')).toBe(0);
    expect(frames.size).toBe(0);
    expect(observerCallback).toBeNull();
  });

  it('shows the start state, then animates once the panel is visible', () => {
    host.animations = fade;
    fixture.detectChanges();

    flushFrame(0); // start-state frame
    expect(layer('l1').style.opacity).toBe('0');
    expect(translateX('l1')).toBe(-200); // -0.5 of the 400 px wide panel

    setVisible(true);
    flushFrame(100);  // first tick: time 0
    flushFrame(350);
    flushFrame(600);  // 500 ms in
    expect(Number(layer('l1').style.opacity)).toBeCloseTo(0.5, 2);
    expect(translateX('l1')).toBe(-100);
    // Layers without keyframes are never touched.
    expect(layer('l2').style.opacity).toBe('');
  });

  it('holds the end state and stops requesting frames when finished', () => {
    host.animations = fade;
    fixture.detectChanges();
    setVisible(true);
    flushFrame(0);
    flushFrame(200);
    flushFrame(400);
    flushFrame(600);
    flushFrame(800);
    flushFrame(1000);
    flushFrame(1100);
    expect(layer('l1').style.opacity).toBe('1');
    expect(translateX('l1')).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('does not count a long frame gap (suspended tab) as animation time', () => {
    host.animations = fade;
    fixture.detectChanges();
    setVisible(true);
    flushFrame(0);
    flushFrame(100);
    flushFrame(60_000); // tab was hidden
    expect(Number(layer('l1').style.opacity)).toBeCloseTo(0.1, 2);
  });

  it('pauses while off-screen and resumes where it stopped', () => {
    host.animations = { ...fade, loop: true };
    fixture.detectChanges();
    setVisible(true);
    flushFrame(0);
    flushFrame(200);
    setVisible(false);
    expect(frames.size).toBe(0);
    setVisible(true);
    flushFrame(5000); // resume: no time counted for the pause
    flushFrame(5200);
    expect(Number(layer('l1').style.opacity)).toBeCloseTo(0.4, 2);
  });

  it('loops when the animation says so', () => {
    host.animations = { ...fade, loop: true };
    fixture.detectChanges();
    setVisible(true);
    flushFrame(0);
    for (let t = 200; t <= 1200; t += 200) flushFrame(t);
    // 1200 ms elapsed on a 1000 ms loop -> 200 ms into the second run.
    expect(Number(layer('l1').style.opacity)).toBeCloseTo(0.2, 2);
    expect(frames.size).toBe(1);
  });

  it('applies the end state without motion for reduced motion', () => {
    host.animations = fade;
    host.reducedMotion = true;
    fixture.detectChanges();
    flushFrame(0);
    expect(layer('l1').style.opacity).toBe('1');
    expect(frames.size).toBe(0);
    expect(observerCallback).toBeNull();
  });

  it('restarts when the panel changes and clears the previous styles', () => {
    host.animations = fade;
    fixture.detectChanges();
    setVisible(true);
    flushFrame(0);
    flushFrame(200);
    expect(layer('l1').style.opacity).not.toBe('');

    host.animations = { keyframes: [{ layerId: 'l2', property: 'transform.scale', timeMs: 0, value: 2 }] };
    host.key = 'p2';
    fixture.detectChanges();
    expect(layer('l1').style.opacity).toBe('');
    expect(layer('l1').style.getPropertyValue('translate')).toBe('');

    flushFrame(0); // zero-duration animation: end state applied once
    expect(layer('l2').style.getPropertyValue('scale')).toBe('2');
  });

  it('ignores keyframes for layers that are not rendered', () => {
    host.animations = { durationMs: 500, keyframes: [{ layerId: 'ghost', property: 'opacity', timeMs: 0, value: 0 }] };
    fixture.detectChanges();
    setVisible(true);
    expect(() => { flushFrame(0); flushFrame(100); }).not.toThrow();
  });

  it('removes its styles and stops on destroy', () => {
    host.animations = fade;
    fixture.detectChanges();
    setVisible(true);
    flushFrame(0);
    const l1 = layer('l1');
    fixture.destroy();
    expect(l1.style.opacity).toBe('');
    expect(frames.size).toBe(0);
  });
});
