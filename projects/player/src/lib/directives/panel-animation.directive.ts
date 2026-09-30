/**
 * Panel Animation Directive
 *
 * Runs a panel's layer keyframes (schema `PanelAnimations.keyframes`, 1.6+)
 * on the layers rendered inside the host element (the panel's box).
 *
 * - The animation starts when the panel is shown: the host scrolls into view
 *   (panel view: immediately, it is the current panel) and restarts whenever
 *   `pwPanelAnimationKey` (the panel id) or the animation itself changes.
 * - Looping animations pause while the panel is off-screen.
 * - Reduced motion: no motion, the end state is applied once.
 *
 * Layers are found by their `data-layer-id` attribute (set by
 * `pw-layer-renderer`) and styled through opacity / filter and the individual
 * transform properties, so the layers' own bindings stay untouched. The frame
 * loop runs outside the Angular zone — it never triggers change detection.
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
import type { PanelAnimations } from '../types';
import {
  animationTime,
  buildKeyframeTracks,
  hasKeyframes,
  keyframeAnimationDuration,
  layerAnimationStyles,
  sampleKeyframes,
  type KeyframeTracks,
} from '../utils/keyframe-animation';

/** Share of the panel (or of the viewport, for oversized panels) that must be visible to start. */
const START_VISIBLE_RATIO = 0.25;

/** A frame gap longer than this is a suspended tab, not animation time. */
const MAX_FRAME_DELTA_MS = 250;

const ANIMATED_STYLE_PROPS = ['opacity', 'translate', 'rotate', 'scale', 'filter'] as const;

@Directive({
  selector: '[pwPanelAnimation]',
  standalone: true,
})
export class PanelAnimationDirective implements OnChanges, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  /** The panel's animation (keyframes are optional; without them the directive is inert). */
  @Input('pwPanelAnimation') animations: PanelAnimations | null | undefined;

  /** Identity of the shown panel — a change restarts the animation. */
  @Input() pwPanelAnimationKey = '';

  /** Reduced-motion preference: apply the end state instead of animating. */
  @Input() pwPanelAnimationReducedMotion = false;

  private tracks: KeyframeTracks = new Map();
  private durationMs = 0;
  private loop = false;

  private elapsedMs = 0;
  private lastFrameTs: number | null = null;
  private frameId: number | null = null;
  private started = false;
  private finished = false;
  private visible = false;
  private observer: IntersectionObserver | null = null;

  /** Layer elements this run has styled (to reset them on restart / destroy). */
  private readonly touched = new Set<HTMLElement>();
  private readonly layerElements = new Map<string, HTMLElement>();

  ngOnChanges(): void {
    this.restart();
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  /** Stop everything and clear the styles this directive applied. */
  private teardown(): void {
    this.cancelFrame();
    this.observer?.disconnect();
    this.observer = null;
    for (const el of this.touched) {
      for (const prop of ANIMATED_STYLE_PROPS) el.style.removeProperty(prop);
    }
    this.touched.clear();
    this.layerElements.clear();
    this.started = false;
    this.finished = false;
    this.visible = false;
    this.elapsedMs = 0;
    this.lastFrameTs = null;
  }

  private restart(): void {
    this.teardown();
    if (!hasKeyframes(this.animations)) return;

    this.tracks = buildKeyframeTracks(this.animations?.keyframes);
    this.durationMs = keyframeAnimationDuration(this.animations);
    this.loop = this.animations?.loop === true && this.durationMs > 0;

    this.zone.runOutsideAngular(() => {
      if (this.pwPanelAnimationReducedMotion || this.durationMs <= 0) {
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

  /** Style every animated layer for the given timeline position. */
  private applyAt(timeMs: number): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    for (const [layerId, state] of sampleKeyframes(this.tracks, timeMs)) {
      const el = this.layerElement(layerId);
      if (!el) continue; // unknown layer id, or the layer is not rendered (yet)
      const styles = layerAnimationStyles(state, width, height);
      for (const prop of ANIMATED_STYLE_PROPS) {
        const value = styles[prop];
        if (value === null) el.style.removeProperty(prop);
        else el.style.setProperty(prop, value);
      }
      this.touched.add(el);
    }
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
