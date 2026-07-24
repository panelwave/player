/**
 * Canvas Camera Service
 *
 * Owns the persistent world-space camera for canvas view: framing math,
 * animated fly-to moves along graph edges (schema 1.4 CameraMove), free-roam
 * pan/zoom with bounds clamping, and the overview zoom. World units:
 * 1 unit = 1 CSS pixel at zoom 1.0.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type {
  CameraMove,
  CanvasCameraPolicy,
  CanvasFitMode,
  CanvasLayout,
  CanvasPlacement,
  WorldPoint,
  WorldRect,
} from '../types';

/**
 * Camera state: world coordinates of the viewport center plus zoom factor
 * (world-to-screen scale).
 */
export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/** Hard readability/asset ceiling for zooming in (not authorable). */
const MAX_ZOOM = 4;

/** Default lowest overview zoom when the policy does not specify one. */
const DEFAULT_MAX_ZOOM_OUT = 0.05;

/** Built-in camera move when neither edge nor preset defines one. */
const DEFAULT_MOVE: Required<Pick<CameraMove, 'path' | 'zoomProfile' | 'durationMs' | 'easing'>> = {
  path: 'direct',
  zoomProfile: 'hold',
  durationMs: 800,
  easing: 'ease-in-out',
};

/**
 * Maximum camera travel speed in viewport-heights per second at the current
 * zoom — long hops get their duration stretched instead of racing across the
 * plane (motion-safety cap, see the integration spec §7).
 */
const MAX_SPEED_VIEWPORTS_PER_SEC = 6;

/** Margin (in world units, pre-zoom) added around auto bounds. */
const AUTO_BOUNDS_MARGIN = 256;

type EasingFn = (t: number) => number;

const EASINGS: Record<string, EasingFn> = {
  linear: (t) => t,
  ease: (t) => cubicBezier(0.25, 0.1, 0.25, 1, t),
  'ease-in': (t) => t * t,
  'ease-out': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

/** Approximate CSS cubic-bezier easing by sampling the bezier's y for x=t. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  // Sufficient approximation for camera easing: solve x(u)=t by bisection.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const x = bezierAxis(x1, x2, mid);
    if (x < t) lo = mid;
    else hi = mid;
  }
  const u = (lo + hi) / 2;
  return bezierAxis(y1, y2, u);
}

function bezierAxis(p1: number, p2: number, u: number): number {
  const v = 1 - u;
  return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
}

@Injectable({
  providedIn: 'root',
})
export class CanvasCameraService {
  private readonly stateSubject = new BehaviorSubject<CameraState>({ x: 0, y: 0, zoom: 1 });

  /** Camera state stream (fires once per animation frame during moves). */
  readonly state$: Observable<CameraState> = this.stateSubject.asObservable();

  private viewportWidth = 1;
  private viewportHeight = 1;

  private policy: CanvasCameraPolicy = {};
  private bounds: WorldRect | null = null;

  private animationFrame: number | null = null;
  private animationResolve: (() => void) | null = null;

  /** Camera state saved when entering overview, restored on exit. */
  private preOverviewState: CameraState | null = null;

  get state(): CameraState {
    return this.stateSubject.value;
  }

  get isAnimating(): boolean {
    return this.animationFrame !== null;
  }

  get isOverview(): boolean {
    return this.preOverviewState !== null;
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /** Configure the camera for a chapter's canvas. Resets overview state. */
  configure(layout: CanvasLayout, viewportWidth: number, viewportHeight: number): void {
    this.policy = layout.camera ?? {};
    this.setViewportSize(viewportWidth, viewportHeight);
    this.bounds =
      this.policy.bounds && this.policy.bounds !== 'auto'
        ? this.policy.bounds
        : this.computeAutoBounds(Object.values(layout.placements ?? {}));
    this.preOverviewState = null;
    this.cancel();
  }

  setViewportSize(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
  }

  /** The configured viewport size (screen pixels). */
  get viewportSize(): { width: number; height: number } {
    return { width: this.viewportWidth, height: this.viewportHeight };
  }

  /** Convert a viewport-relative screen point to world coordinates. */
  screenToWorld(screenX: number, screenY: number): WorldPoint {
    const s = this.state;
    return {
      x: s.x + (screenX - this.viewportWidth / 2) / s.zoom,
      y: s.y + (screenY - this.viewportHeight / 2) / s.zoom,
    };
  }

  /** Union of placement bounding boxes (rotation-expanded) plus a margin. */
  computeAutoBounds(placements: CanvasPlacement[]): WorldRect | null {
    if (placements.length === 0) {
      return null;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const placement of placements) {
      const box = this.placementBoundingBox(placement);
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    }
    return {
      x: minX - AUTO_BOUNDS_MARGIN,
      y: minY - AUTO_BOUNDS_MARGIN,
      w: maxX - minX + 2 * AUTO_BOUNDS_MARGIN,
      h: maxY - minY + 2 * AUTO_BOUNDS_MARGIN,
    };
  }

  /** Axis-aligned bounding box of a (possibly rotated) placement. */
  placementBoundingBox(placement: CanvasPlacement): WorldRect {
    const r = placement.r ?? 0;
    if (r === 0) {
      return { x: placement.x, y: placement.y, w: placement.w, h: placement.h };
    }
    const rad = (r * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = placement.w * cos + placement.h * sin;
    const h = placement.w * sin + placement.h * cos;
    const ox = placement.origin?.x ?? 0.5;
    const oy = placement.origin?.y ?? 0.5;
    // The rotation origin stays fixed; the expanded box is centered on the
    // rotated rect's center, which only moves when the origin is off-center.
    const cx = placement.x + placement.w * ox + (placement.w / 2 - placement.w * ox) * Math.cos(rad) - (placement.h / 2 - placement.h * oy) * Math.sin(rad);
    const cy = placement.y + placement.h * oy + (placement.w / 2 - placement.w * ox) * Math.sin(rad) + (placement.h / 2 - placement.h * oy) * Math.cos(rad);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  // --------------------------------------------------------------------------
  // Framing math
  // --------------------------------------------------------------------------

  /**
   * Camera state that frames a placement (respecting its `enterFraming`
   * panel-relative rect) according to the policy's fit mode.
   */
  frameForPlacement(placement: CanvasPlacement): CameraState {
    const framing = placement.enterFraming;
    let rect: WorldRect;
    if (framing) {
      rect = {
        x: placement.x + framing.x * placement.w,
        y: placement.y + framing.y * placement.h,
        w: Math.max(1, framing.w * placement.w),
        h: Math.max(1, framing.h * placement.h),
      };
    } else {
      rect = this.placementBoundingBox(placement);
    }
    return this.frameForRect(rect, this.policy.fitMode ?? 'contain');
  }

  /** Camera state that frames an arbitrary world rect. */
  frameForRect(rect: WorldRect, fitMode: CanvasFitMode = 'contain'): CameraState {
    const zoomX = this.viewportWidth / rect.w;
    const zoomY = this.viewportHeight / rect.h;
    let zoom: number;
    switch (fitMode) {
      case 'cover':
        zoom = Math.max(zoomX, zoomY);
        break;
      case 'width':
        zoom = zoomX;
        break;
      case 'height':
        zoom = zoomY;
        break;
      case 'contain':
      default:
        zoom = Math.min(zoomX, zoomY);
        break;
    }
    return this.clampState({
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2,
      zoom: this.clampZoom(zoom),
    });
  }

  /** The world rect currently visible for a given camera state. */
  visibleWorldRect(state: CameraState = this.state): WorldRect {
    const w = this.viewportWidth / state.zoom;
    const h = this.viewportHeight / state.zoom;
    return { x: state.x - w / 2, y: state.y - h / 2, w, h };
  }

  // --------------------------------------------------------------------------
  // Animated moves
  // --------------------------------------------------------------------------

  /** Jump instantly (initial placement, reduced motion). */
  jumpTo(target: CameraState): void {
    this.cancel();
    this.preOverviewState = null;
    this.stateSubject.next(this.clampState(target));
  }

  /**
   * Animate the camera to `target` along a CameraMove. Resolves when the
   * move settles or is cancelled/superseded. Reduced motion is handled by
   * the caller (jumpTo + CSS fallback) — this method always glides.
   */
  flyTo(target: CameraState, move?: CameraMove): Promise<void> {
    this.cancel();
    this.preOverviewState = null;

    const from = this.state;
    const to = this.clampState(target);
    const path = move?.path ?? DEFAULT_MOVE.path;
    const zoomProfile = move?.zoomProfile ?? DEFAULT_MOVE.zoomProfile;
    const easing = EASINGS[move?.easing ?? DEFAULT_MOVE.easing] ?? EASINGS['ease-in-out'];
    const durationMs = this.cappedDuration(
      from,
      to,
      move?.durationMs ?? DEFAULT_MOVE.durationMs
    );

    const positions = this.buildPathPoints(from, to, path, move?.waypoints);
    const apexZoom = this.pullBackApexZoom(from, to);

    if (
      durationMs <= 0 ||
      typeof requestAnimationFrame === 'undefined' ||
      typeof performance === 'undefined'
    ) {
      this.stateSubject.next(to);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.animationResolve = resolve;
      const start = performance.now();

      const step = (now: number): void => {
        const rawT = Math.min(1, (now - start) / durationMs);
        const t = easing(rawT);

        const position = this.samplePath(positions, t);
        const zoom = this.sampleZoom(from.zoom, to.zoom, zoomProfile, apexZoom, t);
        this.stateSubject.next(this.clampState({ x: position.x, y: position.y, zoom }));

        if (rawT >= 1) {
          this.stateSubject.next(to);
          this.animationFrame = null;
          this.animationResolve = null;
          resolve();
          return;
        }
        this.animationFrame = requestAnimationFrame(step);
      };
      this.animationFrame = requestAnimationFrame(step);
    });
  }

  /**
   * Cancel a running fly-to (reader grabbed the camera). The pending promise
   * resolves — navigation state is already final; only the glide stops.
   */
  cancel(): void {
    if (this.animationFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrame);
    }
    this.animationFrame = null;
    if (this.animationResolve) {
      const resolve = this.animationResolve;
      this.animationResolve = null;
      resolve();
    }
  }

  // --------------------------------------------------------------------------
  // Free roam & overview
  // --------------------------------------------------------------------------

  /** Pan by a screen-space delta (pixels). */
  panBy(screenDx: number, screenDy: number): void {
    this.cancel();
    const s = this.state;
    this.stateSubject.next(
      this.clampState({ x: s.x - screenDx / s.zoom, y: s.y - screenDy / s.zoom, zoom: s.zoom })
    );
  }

  /**
   * Zoom by a factor keeping the given screen point (relative to the
   * viewport's top-left) stationary — standard map-style zoom-at-cursor.
   */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    this.cancel();
    this.preOverviewState = null;
    const s = this.state;
    const zoom = this.clampZoom(s.zoom * factor);
    if (zoom === s.zoom) {
      return;
    }
    // World point under the cursor before the zoom...
    const worldX = s.x + (screenX - this.viewportWidth / 2) / s.zoom;
    const worldY = s.y + (screenY - this.viewportHeight / 2) / s.zoom;
    // ...stays under the cursor after.
    this.stateSubject.next(
      this.clampState({
        x: worldX - (screenX - this.viewportWidth / 2) / zoom,
        y: worldY - (screenY - this.viewportHeight / 2) / zoom,
        zoom,
      })
    );
  }

  /** Zoom by a factor anchored at the viewport center (keyboard zoom). */
  zoomAtCenter(factor: number): void {
    this.zoomAt(factor, this.viewportWidth / 2, this.viewportHeight / 2);
  }

  /**
   * Toggle the overview: zoom out to the full canvas bounds, or return to
   * the framing the camera had before entering it.
   */
  toggleOverview(animate = true): Promise<void> {
    if (this.policy.overview?.enabled === false) {
      return Promise.resolve();
    }
    if (this.preOverviewState) {
      const restore = this.preOverviewState;
      this.preOverviewState = null;
      return animate ? this.flyTo(restore, { zoomProfile: 'hold', durationMs: 500 }) : (this.jumpTo(restore), Promise.resolve());
    }
    if (!this.bounds) {
      return Promise.resolve();
    }
    const saved = this.state;
    const overview = this.frameForRect(this.bounds, 'contain');
    const promise = animate
      ? this.flyTo(overview, { zoomProfile: 'hold', durationMs: 500 })
      : (this.jumpTo(overview), Promise.resolve());
    // flyTo/jumpTo clear preOverviewState — set it after starting the move.
    this.preOverviewState = saved;
    return promise;
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private clampZoom(zoom: number): number {
    const minZoom = this.overviewMinZoom();
    return Math.min(MAX_ZOOM, Math.max(minZoom, zoom));
  }

  /**
   * The lowest permitted zoom: the smaller of the policy's maxZoomOut and
   * whatever it takes to see the full bounds (so the overview always fits).
   */
  private overviewMinZoom(): number {
    let min = this.policy.overview?.maxZoomOut ?? DEFAULT_MAX_ZOOM_OUT;
    if (this.bounds) {
      const fit = Math.min(this.viewportWidth / this.bounds.w, this.viewportHeight / this.bounds.h);
      min = Math.min(min, fit);
    }
    return Math.max(1e-4, min);
  }

  /** Keep the visible rect inside the bounds (when bounds are known). */
  private clampState(state: CameraState): CameraState {
    const zoom = this.clampZoom(state.zoom);
    if (!this.bounds) {
      return { x: state.x, y: state.y, zoom };
    }
    const half = { w: this.viewportWidth / zoom / 2, h: this.viewportHeight / zoom / 2 };
    let { x, y } = state;
    // When the view is wider than the bounds, center on them instead.
    if (half.w * 2 >= this.bounds.w) {
      x = this.bounds.x + this.bounds.w / 2;
    } else {
      x = Math.min(this.bounds.x + this.bounds.w - half.w, Math.max(this.bounds.x + half.w, x));
    }
    if (half.h * 2 >= this.bounds.h) {
      y = this.bounds.y + this.bounds.h / 2;
    } else {
      y = Math.min(this.bounds.y + this.bounds.h - half.h, Math.max(this.bounds.y + half.h, y));
    }
    return { x, y, zoom };
  }

  /**
   * Stretch too-short durations so the camera never exceeds the speed cap
   * (viewport-heights per second, measured at the destination zoom).
   */
  private cappedDuration(from: CameraState, to: CameraState, durationMs: number): number {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const viewportHeightWorld = this.viewportHeight / Math.max(to.zoom, 1e-4);
    if (viewportHeightWorld <= 0) {
      return durationMs;
    }
    const minMs = (distance / viewportHeightWorld / MAX_SPEED_VIEWPORTS_PER_SEC) * 1000;
    return Math.max(durationMs, Math.ceil(minMs));
  }

  /**
   * Path polyline for the move: direct = [from, to]; waypoints = through the
   * authored points; arc = a single perpendicular-offset midpoint.
   */
  private buildPathPoints(
    from: CameraState,
    to: CameraState,
    path: string,
    waypoints?: WorldPoint[]
  ): WorldPoint[] {
    const start = { x: from.x, y: from.y };
    const end = { x: to.x, y: to.y };
    if (path === 'waypoints' && waypoints && waypoints.length > 0) {
      return [start, ...waypoints, end];
    }
    if (path === 'arc') {
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      // Perpendicular offset of 20% of the travel distance.
      return [start, { x: mx - (dy / len) * len * 0.2, y: my + (dx / len) * len * 0.2 }, end];
    }
    return [start, end];
  }

  /** Sample a polyline by arc length at t in [0,1]. */
  private samplePath(points: WorldPoint[], t: number): WorldPoint {
    if (points.length === 1) {
      return points[0];
    }
    const lengths: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      lengths.push(len);
      total += len;
    }
    if (total === 0) {
      return points[points.length - 1];
    }
    let remaining = t * total;
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i] || i === lengths.length - 1) {
        const segT = lengths[i] === 0 ? 1 : Math.min(1, remaining / lengths[i]);
        return {
          x: points[i].x + (points[i + 1].x - points[i].x) * segT,
          y: points[i].y + (points[i + 1].y - points[i].y) * segT,
        };
      }
      remaining -= lengths[i];
    }
    return points[points.length - 1];
  }

  /**
   * Zoom over the course of the move:
   * - hold: lerp start → end zoom
   * - pull-back: quadratic dip through the apex (out at the middle, back in)
   * - dive: ease-in lerp (accelerating zoom into the target)
   */
  private sampleZoom(
    fromZoom: number,
    toZoom: number,
    profile: string,
    apexZoom: number,
    t: number
  ): number {
    // Interpolate zoom logarithmically — perceptually linear scaling.
    const lerpLog = (a: number, b: number, u: number): number =>
      Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * u);

    switch (profile) {
      case 'pull-back': {
        if (t < 0.5) {
          return lerpLog(fromZoom, apexZoom, t * 2);
        }
        return lerpLog(apexZoom, toZoom, (t - 0.5) * 2);
      }
      case 'dive':
        return lerpLog(fromZoom, toZoom, t * t);
      case 'hold':
      default:
        return lerpLog(fromZoom, toZoom, t);
    }
  }

  /**
   * Pull-back apex: zoomed out far enough that both the source and target
   * viewports fit on screen together (with 20% breathing room), never closer
   * than either endpoint.
   */
  private pullBackApexZoom(from: CameraState, to: CameraState): number {
    const fromRect = this.visibleWorldRect(from);
    const toRect = this.visibleWorldRect(to);
    const minX = Math.min(fromRect.x, toRect.x);
    const minY = Math.min(fromRect.y, toRect.y);
    const maxX = Math.max(fromRect.x + fromRect.w, toRect.x + toRect.w);
    const maxY = Math.max(fromRect.y + fromRect.h, toRect.y + toRect.h);
    const fit = Math.min(
      this.viewportWidth / (maxX - minX),
      this.viewportHeight / (maxY - minY)
    ) / 1.2;
    return Math.max(this.overviewMinZoom(), Math.min(fit, from.zoom, to.zoom));
  }
}
