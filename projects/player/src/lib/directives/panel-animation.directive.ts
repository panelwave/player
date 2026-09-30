/**
 * Panel Animation Directive
 *
 * Runs a panel's animation (schema `PanelAnimations`) inside the host element
 * (the panel's box):
 *
 * - **layer keyframes** (`keyframes`, 1.6+) style the layers rendered in the
 *   host, found by their `data-layer-id` attribute (set by `pw-layer-renderer`);
 * - the **camera move** (`startViewportRect` -> `endViewportRect`) transforms
 *   the host's `.pw-panel-camera` child, which wraps everything that belongs
 *   to the artwork (layers, hotspots, speech bubbles). Without that child a
 *   camera move is skipped.
 *
 * Both run on one timeline:
 *
 * - The animation starts when the panel is shown: the host scrolls into view
 *   (panel view: immediately, it is the current panel) and restarts whenever
 *   `pwPanelAnimationKey` (the panel id) or the animation itself changes.
 * - Looping animations pause while the panel is off-screen.
 * - Reduced motion: no motion, the end state is applied once.
 * - `pwPanelAnimationStatic`: no motion either — the end state is held (the
 *   outgoing panel of a transition).
 *
 * While an animation is attached the host clips its content, so a layer that
 * slides in from outside the panel (or a zoomed camera) never paints over the
 * panel's surroundings.
 *
 * Layers are styled through opacity / filter and the individual transform
 * properties, so their own `transform` stays untouched; inline values the
 * layers carried before (a layer's own opacity) are put back when a property
 * is not animated and when the animation is detached. The frame loop runs
 * outside the Angular zone — it never triggers change detection.
 */
import {
  Directive,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  inject,
} from '@angular/core';
import type { NormalizedRect, PanelAnimations } from '../types';
import {
  animationTime,
  buildKeyframeTracks,
  hasKeyframes,
  keyframeAnimationDuration,
  layerAnimationStyles,
  sampleKeyframes,
  type KeyframeTracks,
} from '../utils/keyframe-animation';
import {
  cameraMoveRects,
  cameraTransformCss,
  sampleViewportRect,
  viewportRectTransform,
} from '../utils/camera-move';

/** Share of the panel (or of the viewport, for oversized panels) that must be visible to start. */
const START_VISIBLE_RATIO = 0.25;

/** A frame gap longer than this is a suspended tab, not animation time. */
const MAX_FRAME_DELTA_MS = 250;

const ANIMATED_STYLE_PROPS = ['opacity', 'translate', 'rotate', 'scale', 'filter'] as const;

/** Class of the host's child that the camera move transforms. */
export const PANEL_CAMERA_CLASS = 'pw-panel-camera';

const CAMERA_STYLE_PROPS = ['transform', 'transform-origin'] as const;

@Directive({
  selector: '[pwPanelAnimation]',
  standalone: true,
})
export class PanelAnimationDirective implements OnChanges, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  /** The panel's animation (without keyframes or a camera move the directive is inert). */
  @Input('pwPanelAnimation') animations: PanelAnimations | null | undefined;

  /** Identity of the shown panel — a change restarts the animation. */
  @Input() pwPanelAnimationKey = '';

  /** Reduced-motion preference: apply the end state instead of animating. */
  @Input() pwPanelAnimationReducedMotion = false;

  /** Hold the end state without playing (e.g. the outgoing panel of a transition). */
  @Input() pwPanelAnimationStatic = false;

  private tracks: KeyframeTracks = new Map();
  private camera: { start: NormalizedRect; end: NormalizedRect } | null = null;
  private durationMs = 0;
  private loop = false;

  private elapsedMs = 0;
  private lastFrameTs: number | null = null;
  private frameId: number | null = null;
  private started = false;
  private finished = false;
  private visible = false;
  private observer: IntersectionObserver | null = null;

  /**
   * Inline values elements carried before this run styled them (restored when
   * a property is not animated and on restart / destroy).
   */
  private readonly originals = new Map<HTMLElement, Map<string, string>>();
  private readonly layerElements = new Map<string, HTMLElement>();

  ngOnChanges(): void {
    this.restart();
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  /** Stop everything and put back the styles this directive replaced. */
  private teardown(): void {
    this.cancelFrame();
    this.observer?.disconnect();
    this.observer = null;
    for (const [el, saved] of this.originals) {
      for (const [prop, value] of saved) this.writeStyle(el, prop, value);
    }
    this.originals.clear();
    this.layerElements.clear();
    this.tracks = new Map();
    this.camera = null;
    this.started = false;
    this.finished = false;
    this.visible = false;
    this.elapsedMs = 0;
    this.lastFrameTs = null;
  }

  private restart(): void {
    this.teardown();
    const camera = cameraMoveRects(this.animations);
    if (!hasKeyframes(this.animations) && !camera) return;

    this.tracks = buildKeyframeTracks(this.animations?.keyframes);
    this.camera = camera;
    this.durationMs = keyframeAnimationDuration(this.animations);
    this.loop = this.animations?.loop === true && this.durationMs > 0;

    // The panel box clips what the animation moves across its edges.
    this.setStyle(this.host, 'overflow', 'hidden');

    this.zone.runOutsideAngular(() => {
      if (this.pwPanelAnimationReducedMotion || this.pwPanelAnimationStatic || this.durationMs <= 0) {
        // No motion: show where the animation ends (after the layers rendered).
        this.finished = true;
        this.requestFrame(() => this.applyAt(this.durationMs));
        return;
      }

      // Start state right away, so layers don't flash at their resting state
      // before the first animated frame.
      this.requestFrame(() => {
        if (!this.started) this.applyAt(0);
      });

      if (typeof IntersectionObserver === 'undefined') {
        this.onVisibility(true);
        return;
      }
      this.observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          const root = entry.rootBounds;
          const visibleArea = entry.intersectionRect.width * entry.intersectionRect.height;
          const fillsViewport = !!root && visibleArea >= root.width * root.height * START_VISIBLE_RATIO;
          this.onVisibility(
            entry.isIntersecting && (entry.intersectionRatio >= START_VISIBLE_RATIO || fillsViewport)
          );
        },
        { threshold: [0, START_VISIBLE_RATIO, 0.5, 1] }
      );
      this.observer.observe(this.host);
    });
  }

  private onVisibility(visible: boolean): void {
    this.visible = visible;
    if (this.finished) return;
    if (visible) {
      if (this.started && this.frameId !== null) return; // already running
      this.started = true;
      this.lastFrameTs = null;
      // Replaces a still-pending start-state frame; the first tick renders time 0 itself.
      this.requestFrame(this.tick);
    } else {
      // Off-screen: hold the current frame (a looping animation resumes later).
      this.cancelFrame();
    }
  }

  private readonly tick = (timestamp: number): void => {
    if (this.lastFrameTs !== null) {
      const delta = timestamp - this.lastFrameTs;
      this.elapsedMs += delta > MAX_FRAME_DELTA_MS ? 0 : Math.max(0, delta);
    }
    this.lastFrameTs = timestamp;

    const { timeMs, done } = animationTime(this.elapsedMs, this.durationMs, this.loop);
    this.applyAt(timeMs);

    if (done) {
      this.finished = true;
      this.observer?.disconnect();
      this.observer = null;
      return;
    }
    if (this.visible) this.requestFrame(this.tick);
  };

  /** Style the camera and every animated layer for the given timeline position. */
  private applyAt(timeMs: number): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;

    if (this.camera) {
      const cameraEl = this.cameraElement();
      if (cameraEl) {
        const rect = sampleViewportRect(this.camera.start, this.camera.end, timeMs, this.durationMs, this.animations?.easing);
        const css = cameraTransformCss(viewportRectTransform(rect, width, height));
        this.setStyle(cameraEl, 'transform-origin', '0 0');
        this.setStyle(cameraEl, 'transform', css);
      }
    }

    for (const [layerId, state] of sampleKeyframes(this.tracks, timeMs)) {
      const el = this.layerElement(layerId);
      if (!el) continue; // unknown layer id, or the layer is not rendered (yet)
      const styles = layerAnimationStyles(state, width, height);
      for (const prop of ANIMATED_STYLE_PROPS) this.setStyle(el, prop, styles[prop]);
    }
  }

  /**
   * Set an inline style, remembering what the element carried before.
   * `null` means "not animated": the element gets its own value back.
   */
  private setStyle(el: HTMLElement, prop: string, value: string | null): void {
    let saved = this.originals.get(el);
    if (!saved) {
      saved = new Map();
      this.originals.set(el, saved);
    }
    if (!saved.has(prop)) {
      if (value === null) return; // never touched, nothing to put back
      saved.set(prop, el.style.getPropertyValue(prop));
    }
    this.writeStyle(el, prop, value ?? (saved.get(prop) as string));
  }

  private writeStyle(el: HTMLElement, prop: string, value: string): void {
    if (value === '') el.style.removeProperty(prop);
    else el.style.setProperty(prop, value);
  }

  private cameraElement(): HTMLElement | null {
    for (const child of Array.from(this.host.children)) {
      if (child.classList.contains(PANEL_CAMERA_CLASS)) return child as HTMLElement;
    }
    return null;
  }

  private layerElement(layerId: string): HTMLElement | null {
    const cached = this.layerElements.get(layerId);
    if (cached && cached.isConnected && this.host.contains(cached)) return cached;
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(layerId) : layerId.replace(/["\\]/g, '\\$&');
    const found = this.host.querySelector<HTMLElement>(`[data-layer-id="${escaped}"]`);
    if (found) this.layerElements.set(layerId, found);
    else this.layerElements.delete(layerId);
    return found;
  }

  private requestFrame(callback: (timestamp: number) => void): void {
    this.cancelFrame();
    this.frameId = requestAnimationFrame((ts) => {
      this.frameId = null;
      callback(ts);
    });
  }

  private cancelFrame(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
}
