/**
 * Canvas Stage Component
 *
 * Renders a chapter's infinite-canvas layout (schema 1.4): all placed panels
 * share one continuous world-space plane; a single composited transform on
 * `.canvas-world` is the camera. Panels outside the (inflated) viewport are
 * virtualized out of the DOM entirely.
 *
 * World units: 1 unit = 1 CSS pixel at zoom 1.0 — placed panels render at
 * their placement size and layers keep their pixel coordinates unchanged.
 */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

import type {
  CanvasDecoration,
  CanvasLayout,
  CanvasPlacement,
  Graph,
  LocaleCode,
  Panel,
  WorldRect,
} from '../../types';
import type { BalloonConfig } from '../../types';
import type { Character } from '../../types';

import { CanvasCameraService, CameraState } from '../../services/canvas-camera.service';
import { ManifestService } from '../../services/manifest.service';
import { LayerRendererComponent } from '../layer-renderer/layer-renderer.component';
import { SpeechBubblesComponent } from '../overlays/speech-bubbles/speech-bubbles.component';

/** A placement prepared for rendering. */
export interface StagePlacement {
  panelId: string;
  panel: Panel;
  placement: CanvasPlacement;
  revealed: boolean;
}

/** Maximum panels mounted in the DOM at once, regardless of chapter size. */
export const CANVAS_PANEL_BUDGET = 12;

/** Movement (px) below which a pointer press counts as a tap. */
const TAP_SLOP_PX = 8;

/** Press duration (ms) below which a pointer press counts as a tap. */
const TAP_MAX_MS = 350;

/** Width fraction of the edge zones that trigger prev/next on tap. */
const EDGE_ZONE_FRACTION = 0.15;

/** Throttle interval for cameraChange emissions. */
const CAMERA_EMIT_INTERVAL_MS = 100;

@Component({
  selector: 'pw-canvas-stage',
  imports: [LayerRendererComponent, SpeechBubblesComponent],
  templateUrl: './canvas-stage.component.html',
  styleUrls: ['./canvas-stage.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasStageComponent implements OnInit, OnChanges, OnDestroy {
  /** The chapter's canvas layout. */
  @Input() canvas: CanvasLayout | null = null;

  /** The chapter's panels by id. */
  @Input() panels: Record<string, Panel> = {};

  /** The chapter's graph (tap-to-advance uses its out-edges). */
  @Input() graph: Graph | null = null;

  /** Id of the current (trail) panel. */
  @Input() currentPanelId: string | null = null;

  /** Panels the trail has visited (drives `revealMode: "on-visit"`). */
  @Input() visitedPanelIds: string[] = [];

  @Input() locale: LocaleCode = 'en-US';
  @Input() speechEnabled = true;
  @Input() workBalloonConfig: BalloonConfig | null = null;
  @Input() characters: Character[] = [];
  @Input() reducedMotion = false;
  @Input() interactive = true;

  /** Tap on a placed panel (shell decides whether it is an edge target). */
  @Output() panelTap = new EventEmitter<string>();

  /** Tap in the right/left edge zone (same semantics as panel view). */
  @Output() navigateNext = new EventEmitter<void>();
  @Output() navigatePrevious = new EventEmitter<void>();

  /** Tap on empty plane (hosts typically toggle the toolbar). */
  @Output() viewportClick = new EventEmitter<void>();

  /** Throttled camera state (position/zoom) for hosts and analytics. */
  @Output() cameraChange = new EventEmitter<CameraState>();

  readonly camera = inject(CanvasCameraService);
  private readonly manifestService = inject(ManifestService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly destroy$ = new Subject<void>();

  /** Current world transform CSS for `.canvas-world`. */
  worldTransform = '';

  /** Placements currently mounted (virtualized working set). */
  stagePlacements: StagePlacement[] = [];

  /** Decorations currently mounted. */
  visibleDecorations: CanvasDecoration[] = [];

  private resizeObserver?: ResizeObserver;
  private lastCameraEmit = 0;

  /** `on-approach` panels that have been revealed this session. */
  private readonly approached = new Set<string>();

  // Pointer/gesture state
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pressStart: { x: number; y: number; time: number } | null = null;
  private isPanning = false;
  private lastPinchDistance = 0;

  ngOnInit(): void {
    this.camera.state$.pipe(takeUntil(this.destroy$)).subscribe((state) => {
      this.onCameraState(state);
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onHostResize());
      this.resizeObserver.observe(this.elementRef.nativeElement);
    }
    this.onHostResize();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['canvas'] && this.canvas) {
      const host = this.elementRef.nativeElement;
      this.camera.configure(this.canvas, host.clientWidth || 1, host.clientHeight || 1);
      // Land on the current panel without animation (initial placement).
      const placement = this.currentPlacement();
      if (placement) {
        this.camera.jumpTo(this.camera.frameForPlacement(placement));
      }
      this.approached.clear();
    }

    // Reduced motion: the shell reframes with jumpTo instead of gliding —
    // soften the hard cut with a short cross-fade (CameraMove's
    // reducedMotionFallback contract; no gliding, ever).
    if (
      changes['currentPanelId'] &&
      !changes['currentPanelId'].firstChange &&
      this.reducedMotion &&
      typeof this.elementRef.nativeElement.animate === 'function'
    ) {
      this.elementRef.nativeElement.animate(
        [{ opacity: 0.15 }, { opacity: 1 }],
        { duration: 220, easing: 'ease-out' }
      );
    }

    this.refreshStage();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.camera.cancel();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --------------------------------------------------------------------------
  // Camera plumbing
  // --------------------------------------------------------------------------

  private onCameraState(state: CameraState): void {
    const host = this.elementRef.nativeElement;
    const vw = host.clientWidth || 1;
    const vh = host.clientHeight || 1;
    this.worldTransform =
      `translate(${vw / 2}px, ${vh / 2}px) ` +
      `scale(${state.zoom}) ` +
      `translate(${-state.x}px, ${-state.y}px)`;
    this.refreshStage();
    this.cdr.markForCheck();

    const now = Date.now();
    if (now - this.lastCameraEmit >= CAMERA_EMIT_INTERVAL_MS) {
      this.lastCameraEmit = now;
      this.cameraChange.emit(state);
    }
  }

  private onHostResize(): void {
    const host = this.elementRef.nativeElement;
    this.camera.setViewportSize(host.clientWidth || 1, host.clientHeight || 1);
    this.onCameraState(this.camera.state);
  }

  private currentPlacement(): CanvasPlacement | null {
    if (!this.canvas || !this.currentPanelId) {
      return null;
    }
    return this.canvas.placements[this.currentPanelId] ?? null;
  }

  // --------------------------------------------------------------------------
  // Virtualization
  // --------------------------------------------------------------------------

  /**
   * Recompute the mounted working set: placements whose bounding box
   * intersects the camera rect inflated by one viewport in every direction,
   * nearest-first, capped at {@link CANVAS_PANEL_BUDGET} — the current panel
   * is always included.
   */
  private refreshStage(): void {
    if (!this.canvas) {
      this.stagePlacements = [];
      this.visibleDecorations = [];
      return;
    }

    const view = this.camera.visibleWorldRect();
    const inflated: WorldRect = {
      x: view.x - view.w,
      y: view.y - view.h,
      w: view.w * 3,
      h: view.h * 3,
    };

    const candidates: (StagePlacement & { distance: number })[] = [];
    for (const [panelId, placement] of Object.entries(this.canvas.placements)) {
      const panel = this.panels[panelId];
      if (!panel) {
        continue;
      }
      const box = this.camera.placementBoundingBox(placement);
      const isCurrent = panelId === this.currentPanelId;
      if (!isCurrent && !rectsIntersect(box, inflated)) {
        continue;
      }
      const cx = box.x + box.w / 2 - this.camera.state.x;
      const cy = box.y + box.h / 2 - this.camera.state.y;
      candidates.push({
        panelId,
        panel,
        placement,
        revealed: this.isRevealed(panelId, placement, view),
        distance: isCurrent ? -1 : Math.hypot(cx, cy),
      });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    this.stagePlacements = candidates
      .slice(0, CANVAS_PANEL_BUDGET)
      .map((candidate) => ({
        panelId: candidate.panelId,
        panel: candidate.panel,
        placement: candidate.placement,
        revealed: candidate.revealed,
      }));

    this.visibleDecorations = (this.canvas.decorations ?? []).filter((decoration) =>
      rectsIntersect(
        { x: decoration.x, y: decoration.y, w: decoration.w, h: decoration.h },
        inflated
      )
    );
  }

  /**
   * Reveal state per placement:
   * - `always` (default): revealed.
   * - `on-visit`: revealed once the trail reached it.
   * - `on-approach`: revealed once the camera rect (x1.5) touches it, then
   *   stays revealed for the session.
   */
  private isRevealed(panelId: string, placement: CanvasPlacement, view: WorldRect): boolean {
    const mode = placement.revealMode ?? 'always';
    if (mode === 'always') {
      return true;
    }
    if (this.currentPanelId === panelId || this.visitedPanelIds.includes(panelId)) {
      return true;
    }
    if (mode === 'on-visit') {
      return false;
    }
    // on-approach
    if (this.approached.has(panelId)) {
      return true;
    }
    const near: WorldRect = {
      x: view.x - view.w * 0.25,
      y: view.y - view.h * 0.25,
      w: view.w * 1.5,
      h: view.h * 1.5,
    };
    if (rectsIntersect(this.camera.placementBoundingBox(placement), near)) {
      this.approached.add(panelId);
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Template helpers
  // --------------------------------------------------------------------------

  placementStyle(entry: StagePlacement): Record<string, string> {
    const p = entry.placement;
    const styles: Record<string, string> = {
      left: `${p.x}px`,
      top: `${p.y}px`,
      width: `${p.w}px`,
      height: `${p.h}px`,
      'z-index': `${p.z ?? 0}`,
    };
    if (p.r) {
      styles['transform'] = `rotate(${p.r}deg)`;
      styles['transform-origin'] = `${(p.origin?.x ?? 0.5) * 100}% ${(p.origin?.y ?? 0.5) * 100}%`;
    }
    return styles;
  }

  decorationStyle(decoration: CanvasDecoration): Record<string, string> {
    const styles: Record<string, string> = {
      left: `${decoration.x}px`,
      top: `${decoration.y}px`,
      width: `${decoration.w}px`,
      height: `${decoration.h}px`,
      'z-index': `${decoration.z ?? 0}`,
    };
    if (decoration.r) {
      styles['transform'] = `rotate(${decoration.r}deg)`;
    }
    const depth = decoration.parallaxDepth ?? 0;
    if (depth !== 0) {
      const s = this.camera.state;
      const rotate = decoration.r ? ` rotate(${decoration.r}deg)` : '';
      styles['transform'] = `translate(${s.x * depth}px, ${s.y * depth}px)${rotate}`;
    }
    if (decoration.opacity !== undefined) {
      styles['opacity'] = `${decoration.opacity}`;
    }
    return styles;
  }

  assetUrl(assetId: string | undefined): string {
    if (!assetId) {
      return '';
    }
    const asset = this.manifestService.getAsset(assetId);
    return asset?.variants?.[0]?.src ?? '';
  }

  backgroundStyle(): Record<string, string> {
    const bg = this.canvas?.background;
    const styles: Record<string, string> = {};
    if (bg?.color) {
      styles['background-color'] = bg.color;
    }
    const url = this.assetUrl(bg?.assetId);
    if (url && bg?.repeat === 'fixed') {
      styles['background-image'] = `url("${url}")`;
      styles['background-size'] = 'cover';
    }
    return styles;
  }

  /** Tiled/stretched backdrop rect covering the canvas bounds (world space). */
  worldBackgroundStyle(): Record<string, string> | null {
    const bg = this.canvas?.background;
    const url = this.assetUrl(bg?.assetId);
    if (!url || bg?.repeat === 'fixed' || !this.canvas) {
      return null;
    }
    const bounds = this.camera.computeAutoBounds(Object.values(this.canvas.placements));
    if (!bounds) {
      return null;
    }
    return {
      left: `${bounds.x}px`,
      top: `${bounds.y}px`,
      width: `${bounds.w}px`,
      height: `${bounds.h}px`,
      'background-image': `url("${url}")`,
      'background-repeat': bg?.repeat === 'stretch' ? 'no-repeat' : 'repeat',
      'background-size': bg?.repeat === 'stretch' ? '100% 100%' : 'auto',
    };
  }

  /** Balloon lettering scale (same DIN-A4 reference as the panel viewport). */
  getReadingScale(): number {
    const h = this.elementRef.nativeElement.clientHeight || 0;
    return h > 0 ? h / 1123 : 1;
  }

  isCurrent(panelId: string): boolean {
    return panelId === this.currentPanelId;
  }

  trackPlacement(_index: number, entry: StagePlacement): string {
    return entry.panelId;
  }

  // --------------------------------------------------------------------------
  // Input handling
  // --------------------------------------------------------------------------

  private freeRoamAllowed(): boolean {
    const mode = this.canvas?.camera?.freeRoam ?? 'between-moves';
    if (mode === 'off') {
      return false;
    }
    if (mode === 'between-moves') {
      return !this.camera.isAnimating;
    }
    return true;
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.interactive) {
      return;
    }
    this.elementRef.nativeElement.setPointerCapture?.(event.pointerId);
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activePointers.size === 1) {
      this.pressStart = { x: event.clientX, y: event.clientY, time: Date.now() };
      this.isPanning = false;
    } else if (this.activePointers.size === 2) {
      this.pressStart = null;
      this.lastPinchDistance = this.pinchDistance();
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.interactive || !this.activePointers.has(event.pointerId)) {
      return;
    }
    const prev = this.activePointers.get(event.pointerId)!;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 2) {
      // Pinch zoom at the midpoint (always allowed — it is the overview gesture).
      const distance = this.pinchDistance();
      if (this.lastPinchDistance > 0 && distance > 0) {
        const rect = this.elementRef.nativeElement.getBoundingClientRect();
        const points = [...this.activePointers.values()];
        const midX = (points[0].x + points[1].x) / 2 - rect.left;
        const midY = (points[0].y + points[1].y) / 2 - rect.top;
        this.camera.zoomAt(distance / this.lastPinchDistance, midX, midY);
      }
      this.lastPinchDistance = distance;
      return;
    }

    const dx = event.clientX - prev.x;
    const dy = event.clientY - prev.y;
    if (!this.isPanning && this.pressStart) {
      const total = Math.hypot(
        event.clientX - this.pressStart.x,
        event.clientY - this.pressStart.y
      );
      if (total > TAP_SLOP_PX) {
        this.isPanning = true;
      }
    }
    if (this.isPanning && this.freeRoamAllowed()) {
      this.camera.panBy(dx, dy);
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size > 0) {
      this.pressStart = null;
      return;
    }

    const press = this.pressStart;
    this.pressStart = null;
    if (!press || this.isPanning) {
      this.isPanning = false;
      return;
    }
    if (Date.now() - press.time > TAP_MAX_MS) {
      return;
    }
    this.handleTap(event);
  }

  onWheel(event: WheelEvent): void {
    if (!this.interactive) {
      return;
    }
    event.preventDefault();
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.002);
      this.camera.zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
    } else if (this.freeRoamAllowed()) {
      this.camera.panBy(-event.deltaX, -event.deltaY);
    }
  }

  private handleTap(event: PointerEvent): void {
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    const hit = this.panelAtScreenPoint(screenX, screenY);
    if (hit && hit !== this.currentPanelId) {
      this.panelTap.emit(hit);
      return;
    }
    if (screenX <= rect.width * EDGE_ZONE_FRACTION) {
      this.navigatePrevious.emit();
      return;
    }
    if (screenX >= rect.width * (1 - EDGE_ZONE_FRACTION)) {
      this.navigateNext.emit();
      return;
    }
    this.viewportClick.emit();
  }

  /** Topmost mounted placement containing the screen point (rotation-aware). */
  panelAtScreenPoint(screenX: number, screenY: number): string | null {
    const { x: worldX, y: worldY } = this.camera.screenToWorld(screenX, screenY);

    const sorted = [...this.stagePlacements].sort(
      (a, b) => (b.placement.z ?? 0) - (a.placement.z ?? 0)
    );
    for (const entry of sorted) {
      if (this.pointInPlacement(worldX, worldY, entry.placement)) {
        return entry.panelId;
      }
    }
    return null;
  }

  private pointInPlacement(x: number, y: number, placement: CanvasPlacement): boolean {
    let px = x;
    let py = y;
    const r = placement.r ?? 0;
    if (r !== 0) {
      const originX = placement.x + placement.w * (placement.origin?.x ?? 0.5);
      const originY = placement.y + placement.h * (placement.origin?.y ?? 0.5);
      const rad = (-r * Math.PI) / 180;
      const dx = x - originX;
      const dy = y - originY;
      px = originX + dx * Math.cos(rad) - dy * Math.sin(rad);
      py = originY + dx * Math.sin(rad) + dy * Math.cos(rad);
    }
    return (
      px >= placement.x &&
      px <= placement.x + placement.w &&
      py >= placement.y &&
      py <= placement.y + placement.h
    );
  }

  private pinchDistance(): number {
    const points = [...this.activePointers.values()];
    if (points.length < 2) {
      return 0;
    }
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }
}

function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
