/**
 * Viewport Component
 * Main rendering container for panels with pan/zoom support
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  inject,
} from '@angular/core';

import { LayerRendererComponent } from '../layer-renderer/layer-renderer.component';
import { PanelAnimationDirective } from '../../directives/panel-animation.directive';
import {
  NO_FOCUS_TRANSFORM,
  focusTransform,
  pickFocusRect,
  type PanelFocusTransform,
} from '../../utils/focus-rect-utils';
import { SpeechBubblesComponent } from '../overlays/speech-bubbles/speech-bubbles.component';
import { HotspotsOverlayComponent } from '../overlays/hotspots-overlay/hotspots-overlay.component';
import { PwIconComponent } from '../icon/pw-icon.component';
import { LockedPanelComponent } from '../locked-panel/locked-panel.component';
import { isLockedPanel } from '../../utils/panel-lock';
import type { Panel, ViewMode, LocaleCode, Page, PanelPlacement, Layer, LocalizedString, AssetCatalogItem, BalloonConfig, Character, Graph, PreloadSettings, Transition, Hotspot, VariableContext } from '../../types';
import { ManifestService } from '../../services/manifest.service';
import { AssetUrlService } from '../../services/asset-url.service';
import { PreloadService } from '../../services/preload.service';
import { quantizeTargetWidth, selectImageVariantForWidth } from '../../utils/image-variant-utils';

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  renderTime: number;
  panelCount: number;
  visiblePanelCount: number;
  culledPanelCount: number;
  memoryUsage?: number;
  transformCalculationTime: number;
}

/**
 * Debounce before re-resolving image variants after a zoom or resize change
 * (mirrors the canvas stage's camera-settle debounce) — never per frame.
 */
const VARIANT_SETTLE_MS = 180;

/**
 * Viewport Component
 * Renders a panel with pan/zoom/transform capabilities
 */
@Component({
    selector: 'pw-viewport',
    imports: [LayerRendererComponent, SpeechBubblesComponent, HotspotsOverlayComponent, PwIconComponent, PanelAnimationDirective, LockedPanelComponent],
    templateUrl: './viewport.component.html',
    styleUrls: ['./viewport.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewportComponent implements OnChanges, OnDestroy {
  private manifestService = inject(ManifestService);
  private assetUrlService = inject(AssetUrlService);
  private preloadService = inject(PreloadService);
  private elementRef = inject(ElementRef<HTMLElement>);
  private cdr = inject(ChangeDetectorRef);

  /**
   * Panel to render (panel view)
   */
  @Input() panel: Panel | null = null;

  /**
   * Page to render (page view)
   */
  @Input() page: Page | null = null;

  /**
   * Panels map for page view lookup
   */
  @Input() panels: Record<string, Panel> = {};

  /**
   * View mode (panel or page)
   */
  @Input() viewMode: ViewMode = 'panel';

  /**
   * Id of the current panel (panel view). Passed to the layer renderer so
   * video layers carry their panel id for tracking / sequencing.
   */
  @Input() currentPanelId: string | null = null;

  /**
   * Current locale for localized content
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Variable context for hotspot visibleIf evaluation
   */
  @Input() variableContext: VariableContext | null = null;

  /**
   * Pan X offset (pixels)
   */
  @Input() panX = 0;

  /**
   * Pan Y offset (pixels)
   */
  @Input() panY = 0;

  /**
   * Zoom level (1.0 = 100%)
   */
  @Input() zoom = 1;

  /**
   * Enable reduced motion
   */
  @Input() reducedMotion = false;

  /**
   * Transition to play when the panel changes (manifest edge transition,
   * already resolved against settings.outputPresets defaultTransition by
   * the flow engine). Null/`none`/`cut` swap instantly.
   */
  @Input() transition: Transition | null = null;

  /**
   * Enable interactive mode (hotspots, etc.)
   */
  @Input() interactive = true;

  /**
   * Show overflow arrows
   */
  @Input() showOverflowArrows = true;

  /**
   * Enable viewport culling (hide off-screen panels)
   */
  @Input() enableViewportCulling = false;

  /**
   * Enable lazy loading for images
   */
  @Input() enableLazyLoading = true;

  /**
   * Work-level balloon config defaults (from settings.typography.balloon_config)
   */
  @Input() workBalloonConfig: BalloonConfig | null = null;

  /**
   * Characters array for resolving character-level balloon overrides
   */
  @Input() characters: Character[] = [];

  /**
   * Global speech toggle. Every speech bubble is implicitly subject to it
   * (schema 1.3+); when false, no bubbles are rendered regardless of their
   * story-logic visibleIf.
   */
  @Input() speechEnabled = true;

  /**
   * The chapter's graph (panel view warms the current panel's out-edge
   * targets); null disables out-edge preloading.
   */
  @Input() graph: Graph | null = null;

  /**
   * Manifest preload settings (settings.preload); null = defaults.
   */
  @Input() preload: PreloadSettings | null = null;

  /**
   * Viewport clicked
   */
  @Output() viewportClick = new EventEmitter<{ x: number; y: number }>();

  /**
   * Performance metrics event
   */
  @Output() performanceMetrics = new EventEmitter<PerformanceMetrics>();

  /**
   * Pan/zoom changed
   */
  @Output() transformChange = new EventEmitter<{ panX: number; panY: number; zoom: number }>();

  /**
   * Layer clicked
   */
  @Output() layerClick = new EventEmitter<{ layerId: string; x: number; y: number }>();

  /**
   * Swipe gesture detected
   */
  @Output() swipe = new EventEmitter<'left' | 'right' | 'up' | 'down'>();

  /**
   * Navigate to previous panel
   */
  @Output() navigatePrevious = new EventEmitter<void>();

  /**
   * Navigate to next panel
   */
  @Output() navigateNext = new EventEmitter<void>();

  /**
   * Panel focus changed
   */
  @Output() panelFocus = new EventEmitter<string | null>();

  /**
   * Hotspot activated (click or keyboard); x/y normalized, panel-relative
   */
  @Output() hotspotActivate = new EventEmitter<{
    hotspot: Hotspot;
    x: number;
    y: number;
    panelId: string | null;
  }>();

  /**
   * Click on panel content that hit no hotspot (dead click); x/y normalized
   */
  @Output() deadClick = new EventEmitter<{ x: number; y: number; panelId: string | null }>();

  // Focus state for navigation
  focusedPanelId: string | null = null;
  focusedPanelIndex = -1;

  // Performance tracking
  private performanceStartTime = 0;
  private renderCount = 0;
  private visiblePanels = new Set<string>();

  // Internal state - Mouse
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  lastPanX = 0;
  lastPanY = 0;

  // Navigation arrows state
  showLeftArrow = false;
  showRightArrow = false;
  private hoverZonePercent = 0.15; // 15% on each side

  // Internal state - Touch
  isTouching = false;
  touchStartX = 0;
  touchStartY = 0;
  lastTouchPanX = 0;
  lastTouchPanY = 0;
  
  // Pinch zoom state
  isPinching = false;
  initialPinchDistance = 0;
  lastPinchZoom = 1;

  // Swipe detection
  swipeStartX = 0;
  swipeStartY = 0;
  swipeStartTime = 0;
  minSwipeDistance = 50; // pixels
  maxSwipeTime = 300; // milliseconds
  minSwipeVelocity = 0.3; // pixels per millisecond

  // Overflow detection
  hasOverflowLeft = false;
  hasOverflowRight = false;
  hasOverflowTop = false;
  hasOverflowBottom = false;

  // Panel-change transition state (panel view). While a transition runs the
  // outgoing panel stays rendered in a `.t-frame-leave` overlay and both
  // frames carry CSS keyframe animation classes.
  leavingPanel: Panel | null = null;
  leavingPanelId = '';
  enterAnimationClass = '';
  leaveAnimationClass = '';
  transitionDuration = '400ms';
  transitionEasing = 'ease';
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  // Page-change transition state (page view). Driven by the pages' own
  // declared `transitions.in` / `transitions.out` (schema Page.transitions):
  // the outgoing page plays its `out` effect in `.pt-frame-leave` while the
  // incoming page plays its `in` effect.
  leavingPage: Page | null = null;
  leavingPagePanels: Record<string, Panel> = {};
  pageEnterClass = '';
  pageLeaveClass = '';
  pageEnterDuration = '400ms';
  pageEnterEasing = 'ease';
  pageLeaveDuration = '400ms';
  pageLeaveEasing = 'ease';
  /** Leave frame stacks above the entering page (out-effect without in-effect). */
  pageLeaveAbove = false;
  private pageTransitionTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Required display width per mounted panel (physical px, quantized) for
   * image variant selection. Upgrade-only while mounted so an already-loaded
   * high-res variant is never swapped back to a smaller rung (no refetch
   * thrash on zoom-out); entries are dropped when their panel unmounts.
   */
  private readonly variantWidths = new Map<string, number>();
  private variantSettleTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Panel-view placement derived from the panel's focus rect
   * (formatViews[...].minimalFocusRect): on a screen smaller than the panel
   * the crop is centered on that rect instead of the panel's middle.
   */
  private focus: PanelFocusTransform = NO_FOCUS_TRANSFORM;
  private focusFrame: number | null = null;

  /** Recompute the focus placement once the current panel is laid out. */
  private scheduleFocusUpdate(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      this.updateFocusTransform();
      return;
    }
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => {
      this.focusFrame = null;
      this.updateFocusTransform();
    });
  }

  /** Measure viewport + panel box and place the panel on its focus rect. */
  updateFocusTransform(): void {
    let next = NO_FOCUS_TRANSFORM;
    if (this.viewMode === 'panel' && this.panel?.formatViews) {
      const host = this.elementRef.nativeElement as HTMLElement;
      const viewport = host.querySelector<HTMLElement>('.viewport-container') ?? host;
      const box = host.querySelector<HTMLElement>('.t-frame .panel-container');
      if (box) {
        const rect = pickFocusRect(this.panel.formatViews, viewport.clientWidth, viewport.clientHeight);
        next = focusTransform(box.offsetWidth, box.offsetHeight, viewport.clientWidth, viewport.clientHeight, rect);
      }
    }
    if (next.offsetX !== this.focus.offsetX || next.offsetY !== this.focus.offsetY || next.scale !== this.focus.scale) {
      this.focus = next;
      this.cdr.markForCheck();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['panel'] || changes['viewMode']) {
      this.scheduleFocusUpdate();
    }
    if (changes['panel']) {
      // Reset pan/zoom when panel changes
      if (changes['panel'].currentValue !== changes['panel'].previousValue) {
        this.resetTransform();

        const previousPanel = changes['panel'].previousValue as Panel | null;
        const animations = this.getTransitionAnimationClasses(this.transition);
        if (previousPanel && animations && this.viewMode === 'panel' && !this.reducedMotion) {
          this.beginPanelTransition(
            previousPanel,
            (changes['currentPanelId']?.previousValue as string | null) ?? this.leavingPanelId,
            animations
          );
        } else {
          this.endPanelTransition();
        }
      }
    }

    if (changes['page']) {
      const previousPage = changes['page'].previousValue as Page | null;
      const nextPage = changes['page'].currentValue as Page | null;
      if (
        previousPage &&
        nextPage &&
        previousPage.id !== nextPage.id &&
        this.viewMode === 'page' &&
        !this.reducedMotion
      ) {
        this.beginPageTransition(
          previousPage,
          nextPage,
          (changes['panels']?.previousValue as Record<string, Panel> | undefined) ?? this.panels
        );
      } else {
        this.endPageTransition();
      }
    }

    // Responsive image variants: recompute per-panel target widths when the
    // mounted content changes; zoom-only changes go through the settle
    // debounce so continuous pinch/wheel zoom never re-resolves per frame.
    const panelChanged =
      changes['panel'] && changes['panel'].currentValue !== changes['panel'].previousValue;
    const pageChanged =
      changes['page'] && changes['page'].currentValue !== changes['page'].previousValue;
    if (panelChanged || pageChanged || changes['viewMode']) {
      this.pruneVariantWidths();
      this.updateVariantWidths();
      this.preloadOutEdgeTargets();
      this.scheduleVariantSettle();
    } else if (changes['zoom']) {
      this.scheduleVariantSettle();
    }
  }

  ngOnDestroy(): void {
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.pageTransitionTimer !== null) {
      clearTimeout(this.pageTransitionTimer);
      this.pageTransitionTimer = null;
    }
    if (this.variantSettleTimer !== null) {
      clearTimeout(this.variantSettleTimer);
      this.variantSettleTimer = null;
    }
    if (this.focusFrame !== null) {
      cancelAnimationFrame(this.focusFrame);
      this.focusFrame = null;
    }
  }

  /**
   * Re-resolve variants after the viewport size changed (debounced like the
   * canvas stage's camera settle), and re-place the panel on its focus rect.
   */
  @HostListener('window:resize')
  onWindowResize(): void {
    this.scheduleVariantSettle();
    this.scheduleFocusUpdate();
  }

  // --------------------------------------------------------------------------
  // Responsive image variants (spec §3.4 — page/panel view)
  // --------------------------------------------------------------------------

  /** Variant-selection width for a mounted panel (0 = legacy first variant). */
  targetWidthFor(panelId: string | null | undefined): number {
    if (!panelId) {
      return 0;
    }
    return this.variantWidths.get(panelId) ?? 0;
  }

  /** Arm (or re-arm) the debounced variant/preload pass. */
  private scheduleVariantSettle(): void {
    if (this.variantSettleTimer !== null) {
      clearTimeout(this.variantSettleTimer);
    }
    this.variantSettleTimer = setTimeout(() => {
      this.variantSettleTimer = null;
      this.onVariantSettled();
    }, VARIANT_SETTLE_MS);
  }

  /** Zoom/resize settled: re-resolve image variants and warm out-edges. */
  private onVariantSettled(): void {
    this.updateVariantWidths();
    this.preloadOutEdgeTargets();
    this.cdr.markForCheck();
  }

  /**
   * Required display width per mounted panel (physical px, quantized).
   * Panel view: container CSS width × zoom × devicePixelRatio.
   * Page view: placement fraction of the page canvas × devicePixelRatio
   * (no per-panel zoom in page view). Upgrade-only while mounted.
   */
  private updateVariantWidths(): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (this.viewMode === 'panel') {
      if (!this.currentPanelId) {
        return;
      }
      const cssWidth = this.getContainerWidth();
      if (cssWidth > 0) {
        this.bumpVariantWidth(this.currentPanelId, quantizeTargetWidth(cssWidth * this.zoom * dpr));
      }
      return;
    }
    if (this.viewMode === 'page' && this.page) {
      for (const placement of this.page.layout?.placements ?? []) {
        const cssWidth = this.getPagePanelWidth(placement);
        if (cssWidth > 0) {
          this.bumpVariantWidth(placement.panelId, quantizeTargetWidth(cssWidth * dpr));
        }
      }
    }
  }

  /** Upgrade-only write: a mounted panel's width never decreases. */
  private bumpVariantWidth(panelId: string, needed: number): void {
    const current = this.variantWidths.get(panelId) ?? 0;
    if (needed > current) {
      this.variantWidths.set(panelId, needed);
    }
  }

  /**
   * Drop widths of panels that are no longer mounted so a revisit starts
   * fresh (the upgrade-only rule applies per mount, not per session).
   */
  private pruneVariantWidths(): void {
    const mounted = new Set<string>();
    if (this.viewMode === 'panel') {
      if (this.currentPanelId) {
        mounted.add(this.currentPanelId);
      }
      if (this.leavingPanelId) {
        mounted.add(this.leavingPanelId);
      }
    } else if (this.viewMode === 'page') {
      for (const placement of this.page?.layout?.placements ?? []) {
        mounted.add(placement.panelId);
      }
      for (const placement of this.leavingPage?.layout?.placements ?? []) {
        mounted.add(placement.panelId);
      }
    }
    for (const panelId of [...this.variantWidths.keys()]) {
      if (!mounted.has(panelId)) {
        this.variantWidths.delete(panelId);
      }
    }
  }

  /**
   * Warm the current panel's out-edge target panels' image variants at the
   * current panel-view target width (same pattern as the canvas stage's
   * preloadNeighbors, minus its spatial neighbors). Honors settings.preload:
   * strategy `none` disables, panelsAhead caps the edge count, maxConcurrent
   * is passed through to the preload service.
   */
  private preloadOutEdgeTargets(): void {
    if (this.viewMode !== 'panel' || this.preload?.strategy === 'none') {
      return;
    }
    const currentId = this.currentPanelId;
    if (!currentId) {
      return;
    }
    if (this.preload?.maxConcurrent) {
      this.preloadService.setMaxConcurrent(this.preload.maxConcurrent);
    }
    const panelsAhead = this.preload?.panelsAhead ?? 2;

    const edgeTargets = (this.graph?.edges ?? [])
      .filter((edge) => edge.from === currentId)
      .map((edge) => edge.to)
      .slice(0, Math.max(panelsAhead, 1));

    const width = this.targetWidthFor(currentId);
    for (const panelId of edgeTargets) {
      const panel = this.panels[panelId];
      if (!panel) {
        continue;
      }
      for (const layer of panel.layers ?? []) {
        if (layer.kind !== 'image' || typeof layer.assetId !== 'string') {
          continue;
        }
        const asset = this.manifestService.getAsset(layer.assetId);
        const variant = selectImageVariantForWidth(asset?.variants as never, width);
        if (variant?.src) {
          this.preloadService.add({
            id: variant.src,
            type: 'image',
            url: this.assetUrlService.resolve(variant.src, 'image'),
            priority: 'high',
            panelId,
          });
        }
      }
    }
  }

  /**
   * Map a manifest Transition onto the enter/leave CSS animation classes.
   * Returns null when nothing should animate (`none`, `cut`, or no type).
   *
   * `dir` is the direction of motion (schema semantics): `left` means the
   * content moves leftward, i.e. the new panel enters from the right.
   * Mapping: `fade`/`zoom` enter over the static old panel; `slide`/`push`
   * move both panels; `cover` slides the new panel over the static old one.
   */
  getTransitionAnimationClasses(
    transition: Transition | null | undefined
  ): { enter: string; leave: string } | null {
    const type = transition?.type;
    if (!type || type === 'none' || type === 'cut') {
      return null;
    }

    const dir = transition?.dir ?? 'left';
    const from: Record<string, string> = {
      left: 't-from-right',
      right: 't-from-left',
      up: 't-from-bottom',
      down: 't-from-top',
    };
    const to: Record<string, string> = {
      left: 't-to-left',
      right: 't-to-right',
      up: 't-to-top',
      down: 't-to-bottom',
    };

    switch (type) {
      case 'fade':
        return { enter: 't-fade-in', leave: '' };
      case 'zoom':
        return { enter: 't-zoom-in', leave: '' };
      case 'cover':
        return { enter: from[dir], leave: '' };
      case 'slide':
      case 'push':
        return { enter: from[dir], leave: to[dir] };
      default:
        return null;
    }
  }

  /**
   * Start rendering the outgoing panel in the leave frame and arm the
   * cleanup timer for the transition duration.
   */
  private beginPanelTransition(
    previousPanel: Panel,
    previousPanelId: string,
    animations: { enter: string; leave: string }
  ): void {
    this.leavingPanel = previousPanel;
    this.leavingPanelId = previousPanelId;
    this.enterAnimationClass = animations.enter;
    this.leaveAnimationClass = animations.leave;

    const durationMs = this.transition?.durationMs ?? 400;
    this.transitionDuration = `${durationMs}ms`;
    this.transitionEasing = this.transition?.easing ?? 'ease';

    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer);
    }
    this.transitionTimer = setTimeout(() => {
      this.endPanelTransition();
      this.cdr.markForCheck();
    }, durationMs);
  }

  /**
   * Drop the leave frame and animation classes (transition finished,
   * interrupted, or not applicable).
   */
  private endPanelTransition(): void {
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    this.leavingPanel = null;
    this.leavingPanelId = '';
    this.enterAnimationClass = '';
    this.leaveAnimationClass = '';
  }

  /**
   * Map a page `out` transition onto its leave-frame CSS animation class.
   * Mirrors getTransitionAnimationClasses(): `dir` is the direction of
   * motion, so an out-slide to the left plays `t-to-left`. Returns '' when
   * nothing should animate (`none`, `cut`, or no type).
   */
  getPageOutAnimationClass(transition: Transition | null | undefined): string {
    const type = transition?.type;
    if (!type || type === 'none' || type === 'cut') {
      return '';
    }

    const dir = transition?.dir ?? 'left';
    const to: Record<string, string> = {
      left: 't-to-left',
      right: 't-to-right',
      up: 't-to-top',
      down: 't-to-bottom',
    };

    switch (type) {
      case 'fade':
        return 't-fade-out';
      case 'zoom':
        return 't-zoom-out';
      case 'slide':
      case 'push':
      case 'cover':
        return to[dir];
      default:
        return '';
    }
  }

  /**
   * Start a page change animation: the outgoing page keeps rendering in the
   * `.pt-frame-leave` overlay with its own `transitions.out` effect while
   * the incoming page plays its `transitions.in` effect. Without declared
   * page transitions the swap stays instant.
   */
  private beginPageTransition(
    previousPage: Page,
    nextPage: Page,
    previousPanels: Record<string, Panel>
  ): void {
    const inTransition = nextPage.transitions?.in;
    const outTransition = previousPage.transitions?.out;

    const enterClass = inTransition
      ? (this.getTransitionAnimationClasses(inTransition)?.enter ?? '')
      : '';
    const leaveClass = this.getPageOutAnimationClass(outTransition);

    if (!enterClass && !leaveClass) {
      this.endPageTransition();
      return;
    }

    this.leavingPage = previousPage;
    this.leavingPagePanels = previousPanels;
    this.pageEnterClass = enterClass;
    this.pageLeaveClass = leaveClass;
    // An out-effect without an in-effect must play above the (static) new
    // page - e.g. the old page slides away and reveals the new one.
    this.pageLeaveAbove = !!leaveClass && !enterClass;

    const enterDurationMs = enterClass ? (inTransition?.durationMs ?? 400) : 0;
    const leaveDurationMs = leaveClass ? (outTransition?.durationMs ?? 400) : 0;
    this.pageEnterDuration = `${enterDurationMs}ms`;
    this.pageEnterEasing = inTransition?.easing ?? 'ease';
    this.pageLeaveDuration = `${leaveDurationMs}ms`;
    this.pageLeaveEasing = outTransition?.easing ?? 'ease';

    if (this.pageTransitionTimer !== null) {
      clearTimeout(this.pageTransitionTimer);
    }
    this.pageTransitionTimer = setTimeout(() => {
      this.endPageTransition();
      this.cdr.markForCheck();
    }, Math.max(enterDurationMs, leaveDurationMs));
  }

  /**
   * Drop the page leave frame and animation classes (page transition
   * finished, interrupted, or not applicable).
   */
  private endPageTransition(): void {
    if (this.pageTransitionTimer !== null) {
      clearTimeout(this.pageTransitionTimer);
      this.pageTransitionTimer = null;
    }
    this.leavingPage = null;
    this.leavingPagePanels = {};
    this.pageEnterClass = '';
    this.pageLeaveClass = '';
    this.pageLeaveAbove = false;
  }

  /**
   * Sorted placements of the leaving page (ascending z), resolved against
   * the panels snapshot taken when the transition started.
   */
  getLeavingPagePlacements(): PanelPlacement[] {
    const placements = this.leavingPage?.layout?.placements ?? [];
    return [...placements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  }

  /**
   * Panel lookup for the leaving page's placements.
   */
  /** True for a server-side paywall stub (`"x-locked": true`). */
  isLocked(panel: Panel | null | undefined): boolean {
    return isLockedPanel(panel);
  }

  getLeavingPanel(panelId: string): Panel | undefined {
    return this.leavingPagePanels[panelId];
  }

  /**
   * Get transform style for viewport
   */
  getTransformStyle(): string {
    // The focus placement is where the panel rests (not motion), so it
    // applies in reduced-motion mode too.
    const { offsetX, offsetY, scale } = this.focus;
    if (this.reducedMotion) {
      // No pan/zoom in reduced motion mode
      return offsetX === 0 && offsetY === 0 && scale === 1
        ? 'translate(-50%, -50%) scale(1)'
        : `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    // First translate centers the panel (-50%, -50%)
    // Then apply pan offsets (plus the focus placement) and zoom
    return `translate(-50%, -50%) translate(${this.panX + offsetX}px, ${this.panY + offsetY}px) scale(${this.zoom * scale})`;
  }

  /**
   * Get CSS class for view mode
   */
  getViewModeClass(): string {
    return `viewport-${this.viewMode}`;
  }

  /**
   * Balloon lettering scale: the player viewport height relative to the DIN A4
   * authoring frame (1123 px). Bubble text keeps the same comfortable reading
   * size on every screen — larger players get moderately larger lettering,
   * phones get smaller — instead of growing proportionally with the panel.
   */
  getReadingScale(): number {
    const h = this.elementRef.nativeElement.clientHeight || 0;
    return h > 0 ? h / 1123 : 1;
  }

  /**
   * Get the container width in pixels (panel view).
   * Used by pw-speech-bubbles to convert normalized coordinates to pixels.
   */
  getContainerWidth(): number {
    const container = this.elementRef.nativeElement.querySelector('.panel-container');
    return container ? container.clientWidth : 0;
  }

  /**
   * Get the container height in pixels (panel view).
   */
  getContainerHeight(): number {
    const container = this.elementRef.nativeElement.querySelector('.panel-container');
    return container ? container.clientHeight : 0;
  }

  /**
   * Get a page-view panel's rendered width in pixels.
   */
  getPagePanelWidth(placement: PanelPlacement): number {
    const pageCanvas = this.elementRef.nativeElement.querySelector('.page-canvas');
    if (!pageCanvas) return 0;
    return placement.w * pageCanvas.clientWidth;
  }

  /**
   * Get a page-view panel's rendered height in pixels.
   */
  getPagePanelHeight(placement: PanelPlacement): number {
    const pageCanvas = this.elementRef.nativeElement.querySelector('.page-canvas');
    if (!pageCanvas) return 0;
    return placement.h * pageCanvas.clientHeight;
  }

  /**
   * Re-emit a hotspot activation with the owning panel id attached
   */
  onHotspotActivate(evt: { hotspot: Hotspot; x: number; y: number }, panelId: string | null): void {
    this.hotspotActivate.emit({ ...evt, panelId });
  }

  /**
   * Dead-click capture: clicks on panel content that hit no hotspot
   * (hotspot hits stop propagation in the overlay and never reach this).
   * Does NOT stop propagation itself — tap-to-advance keeps working.
   */
  onPanelContainerClick(event: MouseEvent, panelId: string | null): void {
    if (!this.interactive) return;
    const el = event.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    this.deadClick.emit({
      x: Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (event.clientY - r.top) / r.height)),
      panelId,
    });
  }

  /**
   * Handle viewport click
   */
  onViewportClick(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.viewportClick.emit({ x, y });
  }

  /**
   * Handle keyboard activation
   */
  onKeyboardActivate(event: Event): void {
    event.preventDefault();
    // Emit click at center of viewport
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.width / 2;
    const y = rect.height / 2;

    this.viewportClick.emit({ x, y });
  }

  /**
   * Handle mouse down for pan
   */
  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Left button only

    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.lastPanX = this.panX;
    this.lastPanY = this.panY;

    // Track for swipe detection
    this.swipeStartX = event.clientX;
    this.swipeStartY = event.clientY;
    this.swipeStartTime = Date.now();

    event.preventDefault();
  }

  /**
   * Handle mouse move for pan
   */
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    const newPanX = this.lastPanX + deltaX;
    const newPanY = this.lastPanY + deltaY;

    this.transformChange.emit({
      panX: newPanX,
      panY: newPanY,
      zoom: this.zoom,
    });
  }

  /**
   * Handle mouse up for pan
   */
  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    // Detect swipe before resetting drag state
    if (this.isDragging) {
      this.detectSwipe(event.clientX, event.clientY);
    }
    
    this.isDragging = false;
  }

  /**
   * Handle mouse wheel for zoom
   */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return; // Zoom only with Ctrl/Cmd

    event.preventDefault();

    const delta = -event.deltaY;
    const zoomFactor = 0.001;
    const newZoom = Math.max(0.1, Math.min(5, this.zoom + delta * zoomFactor));

    this.transformChange.emit({
      panX: this.panX,
      panY: this.panY,
      zoom: newZoom,
    });
  }

  /**
   * Handle touch start
   */
  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      // Single touch - pan
      this.isTouching = true;
      this.isPinching = false;
      
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.lastTouchPanX = this.panX;
      this.lastTouchPanY = this.panY;
      
      // Track for swipe detection
      this.swipeStartX = touch.clientX;
      this.swipeStartY = touch.clientY;
      this.swipeStartTime = Date.now();
    } else if (event.touches.length === 2) {
      // Two touches - pinch zoom
      this.isTouching = false;
      this.isPinching = true;
      
      this.initialPinchDistance = this.getPinchDistance(event.touches);
      this.lastPinchZoom = this.zoom;
    }
  }

  /**
   * Handle touch move
   */
  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent): void {
    if (this.isTouching && event.touches.length === 1) {
      // Pan with single touch
      event.preventDefault();
      
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;

      const newPanX = this.lastTouchPanX + deltaX;
      const newPanY = this.lastTouchPanY + deltaY;

      this.transformChange.emit({
        panX: newPanX,
        panY: newPanY,
        zoom: this.zoom,
      });
    } else if (this.isPinching && event.touches.length === 2) {
      // Pinch zoom with two touches
      event.preventDefault();
      
      const currentDistance = this.getPinchDistance(event.touches);
      const scale = currentDistance / this.initialPinchDistance;
      const newZoom = Math.max(0.1, Math.min(5, this.lastPinchZoom * scale));

      this.transformChange.emit({
        panX: this.panX,
        panY: this.panY,
        zoom: newZoom,
      });
    }
  }

  /**
   * Handle touch end
   */
  @HostListener('touchend', ['$event'])
  @HostListener('touchcancel', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    // Detect swipe before resetting touch state
    if (event.changedTouches.length > 0 && this.isTouching) {
      const touch = event.changedTouches[0];
      this.detectSwipe(touch.clientX, touch.clientY);
    }

    if (event.touches.length === 0) {
      this.isTouching = false;
      this.isPinching = false;
    } else if (event.touches.length === 1 && this.isPinching) {
      // Switched from pinch to pan
      this.isPinching = false;
      this.isTouching = true;
      
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.lastTouchPanX = this.panX;
      this.lastTouchPanY = this.panY;
      
      // Reset swipe tracking
      this.swipeStartX = touch.clientX;
      this.swipeStartY = touch.clientY;
      this.swipeStartTime = Date.now();
    }
  }

  /**
   * Calculate distance between two touch points
   */
  private getPinchDistance(touches: TouchList): number {
    const touch1 = touches[0];
    const touch2 = touches[1];
    
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Reset transform to default
   */
  resetTransform(): void {
    this.transformChange.emit({
      panX: 0,
      panY: 0,
      zoom: 1,
    });
  }

  /**
   * Fit panel to viewport
   */
  fitToViewport(): void {
    if (!this.panel) return;

    // Calculate zoom to fit
    // This would need viewport dimensions - simplified for now
    this.transformChange.emit({
      panX: 0,
      panY: 0,
      zoom: 1,
    });
  }

  /**
   * Get panel dimensions
   */
  getPanelDimensions(): { width: number; height: number } {
    if (!this.panel) {
      return { width: 0, height: 0 };
    }

    // Calculate from layers - simplified
    return { width: 800, height: 600 };
  }

  /**
   * Detect overflow in all directions
   */
  detectOverflow(): void {
    if (!this.panel) {
      this.hasOverflowLeft = false;
      this.hasOverflowRight = false;
      this.hasOverflowTop = false;
      this.hasOverflowBottom = false;
      return;
    }

    const panelDim = this.getPanelDimensions();
    const viewportWidth = 800; // Would get from actual viewport element
    const viewportHeight = 600;

    // Check if content can scroll in each direction
    this.hasOverflowLeft = this.panX < 0;
    this.hasOverflowRight = this.panX + panelDim.width * this.zoom > viewportWidth;
    this.hasOverflowTop = this.panY < 0;
    this.hasOverflowBottom = this.panY + panelDim.height * this.zoom > viewportHeight;
  }

  /**
   * Navigate left (show more content on the right)
   */
  navigateLeft(): void {
    const step = 200;
    this.transformChange.emit({
      panX: this.panX + step,
      panY: this.panY,
      zoom: this.zoom,
    });
  }

  /**
   * Navigate right (show more content on the left)
   */
  navigateRight(): void {
    const step = 200;
    this.transformChange.emit({
      panX: this.panX - step,
      panY: this.panY,
      zoom: this.zoom,
    });
  }

  /**
   * Navigate up (show more content below)
   */
  navigateUp(): void {
    const step = 200;
    this.transformChange.emit({
      panX: this.panX,
      panY: this.panY + step,
      zoom: this.zoom,
    });
  }

  /**
   * Navigate down (show more content above)
   */
  navigateDown(): void {
    const step = 200;
    this.transformChange.emit({
      panX: this.panX,
      panY: this.panY - step,
      zoom: this.zoom,
    });
  }

  /**
   * Index of a panel in the current page's reading order, or -1 when absent.
   * Used to order the page-view video sequencer.
   */
  readingOrderIndexOf(panelId: string): number {
    return this.page?.readingOrder ? this.page.readingOrder.indexOf(panelId) : -1;
  }

  /**
   * Get panels sorted by z-index (lowest to highest for rendering order)
   */
  getSortedPanels(): PanelPlacement[] {
    if (!this.page?.layout.placements) return [];
    
    return [...this.page.layout.placements].sort((a, b) => {
      const zA = a.z ?? 0;
      const zB = b.z ?? 0;
      return zA - zB;
    });
  }

  /**
   * Convert normalized value (0-1) to percentage
   */
  toPercent(value: number): number {
    return value * 100;
  }

  /**
   * Get CSS transform for panel (rotation)
   */
  getPanelTransform(placement: PanelPlacement): string {
    if (!placement.r || placement.r === 0) {
      return 'none';
    }
    return `rotate(${placement.r}deg)`;
  }

  /**
   * Get transform origin CSS for panel
   */
  getTransformOrigin(placement: PanelPlacement): string {
    if (!placement.origin) {
      return 'center center'; // Default
    }
    
    const x = placement.origin.x * 100;
    const y = placement.origin.y * 100;
    return `${x}% ${y}%`;
  }

  /**
   * Get clip-path CSS for panel content (visible area)
   * Returns inset values to show only the visible portion of the panel
   */
  getPanelContentClipPath(placement: PanelPlacement): string {
    const vx = placement.vx ?? 0;
    const vy = placement.vy ?? 0;
    const vw = placement.vw ?? 1;
    const vh = placement.vh ?? 1;
    
    // If full panel is visible, no clipping needed
    if (vx === 0 && vy === 0 && vw === 1 && vh === 1) {
      return 'none';
    }
    
    // Calculate inset values as percentages
    // inset(top right bottom left)
    const top = vy * 100;
    const right = (1 - (vx + vw)) * 100;
    const bottom = (1 - (vy + vh)) * 100;
    const left = vx * 100;
    
    return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  }

  /**
   * Get position offset for panel content (visible area)
   * Returns translate transform to shift content when visible area is cropped
   */
  getPanelContentTransform(placement: PanelPlacement): string {
    const vx = placement.vx ?? 0;
    const vy = placement.vy ?? 0;
    
    // If no offset, return none
    if (vx === 0 && vy === 0) {
      return 'none';
    }
    
    // Translate content by negative offset to show the visible portion
    const translateX = -vx * 100;
    const translateY = -vy * 100;
    
    return `translate(${translateX}%, ${translateY}%)`;
  }

  /**
   * Handle panel click in page view
   */
  onPanelClick(event: MouseEvent, panelId: string): void {
    event.stopPropagation();
    
    // Get click coordinates relative to panel
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Emit viewport click with panel context
    this.viewportClick.emit({ x, y });

    console.log(`Panel clicked: ${panelId} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
  }

  /**
   * Keyboard activation (Enter/Space) of a focusable page-view panel —
   * mirrors onPanelClick with the panel center as the activation point.
   */
  onPanelKeyboardActivate(event: Event, panelId: string): void {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.viewportClick.emit({ x: rect.width / 2, y: rect.height / 2 });
    console.log(`Panel activated via keyboard: ${panelId}`);
  }

  /**
   * Check if point is inside a rotated panel
   * Used for precise hit testing when panels have rotation
   */
  isPointInRotatedPanel(
    point: { x: number; y: number },
    placement: PanelPlacement,
    canvasWidth: number,
    canvasHeight: number
  ): boolean {
    // Convert normalized placement to pixel coordinates
    const panelX = placement.x * canvasWidth;
    const panelY = placement.y * canvasHeight;
    const panelWidth = placement.w * canvasWidth;
    const panelHeight = placement.h * canvasHeight;

    // If no rotation, simple bounding box check
    if (!placement.r || placement.r === 0) {
      return (
        point.x >= panelX &&
        point.x <= panelX + panelWidth &&
        point.y >= panelY &&
        point.y <= panelY + panelHeight
      );
    }

    // For rotated panels, transform point to panel's local space
    const origin = placement.origin || { x: 0.5, y: 0.5 };
    const originX = panelX + panelWidth * origin.x;
    const originY = panelY + panelHeight * origin.y;

    // Translate point to origin
    const translatedX = point.x - originX;
    const translatedY = point.y - originY;

    // Rotate point by negative rotation angle (inverse rotation)
    const angleRad = (-placement.r * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;

    // Translate back and check if in axis-aligned bounding box
    const localX = rotatedX + panelWidth * origin.x;
    const localY = rotatedY + panelHeight * origin.y;

    return (
      localX >= 0 &&
      localX <= panelWidth &&
      localY >= 0 &&
      localY <= panelHeight
    );
  }

  /**
   * Get the panel at a specific point, considering rotation and z-index
   * Returns the top-most panel (highest z-index) at the given point
   */
  getPanelAtPoint(point: { x: number; y: number }): PanelPlacement | null {
    if (!this.page?.layout.placements) return null;

    const canvas = document.querySelector('.page-canvas') as HTMLElement;
    if (!canvas) return null;

    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    // Check from highest z-index to lowest (reverse of render order)
    const sortedPanels = this.getSortedPanels().reverse();

    for (const placement of sortedPanels) {
      if (this.isPointInRotatedPanel(point, placement, canvasWidth, canvasHeight)) {
        return placement;
      }
    }

    return null;
  }

  /**
   * Get panel by ID from panels map
   */
  getPanel(panelId: string): Panel | undefined {
    if (!this.panels || !this.panels[panelId]) {
      console.warn(`Panel not found: ${panelId}`);
      return undefined;
    }
    return this.panels[panelId];
  }

  /**
   * Whether a page-view panel renders interactive hotspots. Such panels
   * must not be buttons themselves — nesting the hotspot buttons inside
   * an interactive container breaks screen readers (axe: nested-interactive).
   */
  panelHasHotspots(panelId: string): boolean {
    const panel = this.panels?.[panelId];
    return this.interactive && !!panel?.hotspots?.length;
  }

  /**
   * Get alt text for a layer from the asset catalog
   */
  getAltText(layer: Layer): string {
    if (!layer.assetId) return '';
    
    // Get manifest and asset catalog
    const manifest = this.manifestService.getManifest();
    if (!manifest?.assets?.catalog) return '';
    
    // Find asset by ID
    const asset = manifest.assets.catalog.find((a: AssetCatalogItem) => a.id === layer.assetId);
    if (!asset?.alt) return '';
    
    // Get localized alt text
    return this.getLocalizedString(asset.alt);
  }

  /**
   * Get localized string based on current locale
   */
  private getLocalizedString(text: LocalizedString): string {
    if (!text || typeof text !== 'object') return '';
    
    // Try exact locale match
    if (text[this.locale]) return text[this.locale];
    
    // Try base language (e.g., en-US -> en)
    const baseLocale = this.locale.split('-')[0];
    const baseMatch = Object.keys(text).find(key => key.startsWith(baseLocale));
    if (baseMatch && text[baseMatch]) return text[baseMatch];
    
    // Fallback to first available
    const firstKey = Object.keys(text)[0];
    return firstKey ? text[firstKey] : '';
  }

  /**
   * Detect swipe gesture
   */
  private detectSwipe(endX: number, endY: number): void {
    const deltaX = endX - this.swipeStartX;
    const deltaY = endY - this.swipeStartY;
    const deltaTime = Date.now() - this.swipeStartTime;
    
    // Calculate distance and velocity
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = distance / deltaTime; // pixels per millisecond
    
    // Check if it's a valid swipe (fast enough and far enough)
    if (deltaTime > this.maxSwipeTime || distance < this.minSwipeDistance) {
      return; // Not a swipe, just a slow drag
    }
    
    if (velocity < this.minSwipeVelocity) {
      return; // Too slow to be considered a swipe
    }
    
    // Determine swipe direction (prioritize horizontal or vertical)
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    if (absDeltaX > absDeltaY) {
      // Horizontal swipe
      if (deltaX > 0) {
        this.swipe.emit('right');
      } else {
        this.swipe.emit('left');
      }
    } else {
      // Vertical swipe
      if (deltaY > 0) {
        this.swipe.emit('down');
      } else {
        this.swipe.emit('up');
      }
    }
  }

  /**
   * Handle viewport mouse move for navigation arrows
   */
  onViewportMouseMove(event: MouseEvent): void {
    // Only show arrows in panel view
    if (this.viewMode !== 'panel') {
      this.showLeftArrow = false;
      this.showRightArrow = false;
      return;
    }

    const target = event.currentTarget as HTMLElement;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;

    const leftZoneWidth = width * this.hoverZonePercent;
    const rightZoneStart = width - (width * this.hoverZonePercent);

    this.showLeftArrow = x <= leftZoneWidth;
    this.showRightArrow = x >= rightZoneStart;
  }

  /**
   * Handle viewport mouse leave - hide arrows
   */
  onViewportMouseLeave(): void {
    this.showLeftArrow = false;
    this.showRightArrow = false;
  }

  /**
   * Navigate to previous panel
   */
  onNavigatePrevious(): void {
    this.navigatePrevious.emit();
  }

  /**
   * Navigate to next panel
   */
  onNavigateNext(): void {
    this.navigateNext.emit();
  }

  /**
   * Set focus on a specific panel
   */
  focusPanel(panelId: string | null): void {
    this.focusedPanelId = panelId;
    
    if (panelId && this.page?.readingOrder) {
      this.focusedPanelIndex = this.page.readingOrder.indexOf(panelId);
    } else {
      this.focusedPanelIndex = -1;
    }
    
    this.panelFocus.emit(panelId);
  }

  /**
   * Handle keyboard navigation (Tab key)
   */
  @HostListener('keydown.tab', ['$event'])
  onKeydownTab(event: KeyboardEvent): void {
    if (this.viewMode !== 'page' || !this.page?.readingOrder) return;
    
    event.preventDefault();
    
    const readingOrder = this.page.readingOrder;
    const currentIndex = this.focusedPanelIndex;
    
    if (event.shiftKey) {
      // Navigate backwards (Shift+Tab)
      const newIndex = currentIndex <= 0 ? readingOrder.length - 1 : currentIndex - 1;
      this.focusPanel(readingOrder[newIndex]);
    } else {
      // Navigate forwards (Tab)
      const newIndex = currentIndex >= readingOrder.length - 1 ? 0 : currentIndex + 1;
      this.focusPanel(readingOrder[newIndex]);
    }
  }

  /**
   * Handle arrow key navigation
   */
  @HostListener('keydown.arrowRight', ['$event'])
  @HostListener('keydown.arrowDown', ['$event'])
  onKeydownNext(event: KeyboardEvent): void {
    if (this.viewMode !== 'page' || !this.page?.readingOrder) return;
    
    event.preventDefault();
    
    const readingOrder = this.page.readingOrder;
    const currentIndex = this.focusedPanelIndex;
    const newIndex = currentIndex >= readingOrder.length - 1 ? 0 : currentIndex + 1;
    
    this.focusPanel(readingOrder[newIndex]);
  }

  @HostListener('keydown.arrowLeft', ['$event'])
  @HostListener('keydown.arrowUp', ['$event'])
  onKeydownPrevious(event: KeyboardEvent): void {
    if (this.viewMode !== 'page' || !this.page?.readingOrder) return;
    
    event.preventDefault();
    
    const readingOrder = this.page.readingOrder;
    const currentIndex = this.focusedPanelIndex;
    const newIndex = currentIndex <= 0 ? readingOrder.length - 1 : currentIndex - 1;
    
    this.focusPanel(readingOrder[newIndex]);
  }

  /**
   * Handle panel click with overlap handling
   * Enhanced to set focus on clicked panel
   */
  onPanelClickWithFocus(event: MouseEvent): void {
    if (this.viewMode !== 'page') return;
    
    const canvas = event.currentTarget as HTMLElement;
    if (!canvas) return;
    
    // Determine which panel was clicked
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    
    // Find the top-most panel at click position
    const clickedPanel = this.getPanelAtPoint(point);
    
    if (clickedPanel) {
      this.focusPanel(clickedPanel.panelId);
      console.log(`Panel focused: ${clickedPanel.panelId} (z-index: ${clickedPanel.z || 0})`);
    } else {
      // Clicked on empty space - clear focus
      this.focusPanel(null);
    }
  }

  /**
   * Handle keyboard activation of canvas (Enter/Space)
   * Focuses on the first panel in reading order if nothing is focused
   */
  onCanvasKeyboardActivate(event: Event): void {
    if (this.viewMode !== 'page') return;
    
    event.preventDefault();
    
    // If nothing is focused, focus on the first panel in reading order
    if (!this.focusedPanelId && this.page?.readingOrder && this.page.readingOrder.length > 0) {
      this.focusPanel(this.page.readingOrder[0]);
    }
  }

  /**
   * Get focus rect for a panel (accounting for rotation)
   * Returns the bounding box coordinates for focus visualization
   */
  getFocusRect(placement: PanelPlacement): {
    left: number;
    top: number;
    width: number;
    height: number;
    rotation: number;
  } | null {
    const canvas = document.querySelector('.page-canvas') as HTMLElement;
    if (!canvas) return null;
    
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    
    // Convert normalized to pixel coordinates
    const left = placement.x * canvasWidth;
    const top = placement.y * canvasHeight;
    const width = placement.w * canvasWidth;
    const height = placement.h * canvasHeight;
    
    return {
      left,
      top,
      width,
      height,
      rotation: placement.r || 0
    };
  }

  /**
   * Check if a panel is currently focused
   */
  isPanelFocused(panelId: string): boolean {
    return this.focusedPanelId === panelId;
  }

  /**
   * Check if a panel is visible in viewport (for culling)
   */
  isPanelVisible(placement: PanelPlacement): boolean {
    if (!this.enableViewportCulling) {
      return true; // Always visible if culling disabled
    }

    const canvas = document.querySelector('.page-canvas') as HTMLElement;
    if (!canvas) return true;
    
    // Convert normalized to pixel coordinates
    const panelLeft = placement.x * canvas.offsetWidth;
    const panelTop = placement.y * canvas.offsetHeight;
    const panelWidth = placement.w * canvas.offsetWidth;
    const panelHeight = placement.h * canvas.offsetHeight;

    // Simple bounding box check (could be enhanced for rotation)
    const panelRight = panelLeft + panelWidth;
    const panelBottom = panelTop + panelHeight;

    // Check if panel intersects viewport
    const isVisible = !(
      panelRight < 0 ||
      panelBottom < 0 ||
      panelLeft > canvas.offsetWidth ||
      panelTop > canvas.offsetHeight
    );

    // Track visible panels
    if (isVisible) {
      this.visiblePanels.add(placement.panelId);
    } else {
      this.visiblePanels.delete(placement.panelId);
    }

    return isVisible;
  }

  /**
   * Start performance measurement
   */
  startPerformanceMeasurement(): void {
    this.performanceStartTime = performance.now();
  }

  /**
   * End performance measurement and emit metrics
   */
  endPerformanceMeasurement(): void {
    if (this.performanceStartTime === 0) return;

    const renderTime = performance.now() - this.performanceStartTime;
    const panelCount = this.page?.layout.placements.length || 0;
    const visiblePanelCount = this.visiblePanels.size;
    const culledPanelCount = panelCount - visiblePanelCount;

    // Calculate memory usage if available
    let memoryUsage: number | undefined;
    if ('memory' in performance) {
      const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (perfMemory) {
        memoryUsage = perfMemory.usedJSHeapSize / 1024 / 1024; // MB
      }
    }

    const metrics: PerformanceMetrics = {
      renderTime,
      panelCount,
      visiblePanelCount,
      culledPanelCount,
      memoryUsage,
      transformCalculationTime: 0 // Updated separately if needed
    };

    this.performanceMetrics.emit(metrics);
    this.renderCount++;
  }

  /**
   * Get lazy loading state for images
   * Returns 'lazy' if lazy loading is enabled, 'eager' otherwise
   */
  getImageLoadingStrategy(): 'lazy' | 'eager' {
    return this.enableLazyLoading ? 'lazy' : 'eager';
  }

  /**
   * Measure transform calculation performance
   */
  measureTransformPerformance(callback: () => void): number {
    const start = performance.now();
    callback();
    const end = performance.now();
    return end - start;
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    totalRenders: number;
    averageRenderTime: number;
    visiblePanelCount: number;
    memoryUsage?: number;
  } {
    let memoryUsage: number | undefined;
    if ('memory' in performance) {
      const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (perfMemory) {
        memoryUsage = perfMemory.usedJSHeapSize / 1024 / 1024; // MB
      }
    }

    return {
      totalRenders: this.renderCount,
      averageRenderTime: 0, // Would need to track average over time
      visiblePanelCount: this.visiblePanels.size,
      memoryUsage
    };
  }

  /**
   * Force garbage collection (if available)
   * Note: This is only available in dev mode or with specific flags
   */
  forceGarbageCollection(): void {
    const globalWithGC = globalThis as unknown as { gc?: () => void };
    if ('gc' in globalThis && typeof globalWithGC.gc === 'function') {
      globalWithGC.gc();
      console.log('[Performance] Garbage collection triggered');
    } else {
      console.warn('[Performance] Garbage collection not available');
    }
  }

  /**
   * Profile memory usage
   */
  profileMemory(): {
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  } {
    if ('memory' in performance) {
      const perfMemory = (performance as unknown as { 
        memory?: { 
          totalJSHeapSize: number; 
          usedJSHeapSize: number; 
          jsHeapSizeLimit: number 
        } 
      }).memory;
      
      if (perfMemory) {
        return {
          totalJSHeapSize: perfMemory.totalJSHeapSize / 1024 / 1024, // MB
          usedJSHeapSize: perfMemory.usedJSHeapSize / 1024 / 1024, // MB
          jsHeapSizeLimit: perfMemory.jsHeapSizeLimit / 1024 / 1024 // MB
        };
      }
    }
    return {};
  }

  /**
   * Log performance metrics to console
   */
  logPerformanceMetrics(): void {
    const stats = this.getPerformanceStats();
    const memory = this.profileMemory();

    console.group('[Performance Metrics]');
    console.log('Total Renders:', stats.totalRenders);
    console.log('Visible Panels:', stats.visiblePanelCount);
    if (stats.memoryUsage) {
      console.log('Memory Usage:', stats.memoryUsage.toFixed(2), 'MB');
    }
    if (memory.usedJSHeapSize) {
      console.log('Heap Used:', memory.usedJSHeapSize.toFixed(2), 'MB');
      console.log('Heap Total:', memory.totalJSHeapSize?.toFixed(2), 'MB');
      console.log('Heap Limit:', memory.jsHeapSizeLimit?.toFixed(2), 'MB');
    }
    console.groupEnd();
  }
}
