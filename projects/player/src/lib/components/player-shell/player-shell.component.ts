/**
 * Player Shell Component
 * Main container component that orchestrates the entire PanelWave player
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  HostListener,
  inject,
} from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { CustomTranslateLoader } from '../../utils/translation-loader';

import { PlayerEvent } from '../../types';
import type {
  PanelWaveManifest,
  Panel,
  Page,
  Chapter,
  LocaleCode,
  Character as ManifestCharacter,
  Transition,
  VideoLayer,
  VideoTrackingPayload,
  CameraMove,
  ViewMode,
  BalloonConfig,
} from '../../types';
import type { Character as RosterCharacter } from '../modals/character-roster/character-roster.component';

import { PlayerStateService } from '../../services/player-state.service';
import { ManifestService } from '../../services/manifest.service';
import { VariableStoreService } from '../../services/variable-store.service';
import { FlowEngineService } from '../../services/flow-engine.service';
import { TranslationService } from '../../services/translation.service';
import { TrackingService } from '../../services/tracking.service';
import { VideoControllerService } from '../../services/video-controller.service';
import { VideoSequencerService } from '../../services/video-sequencer.service';
import { resolveStartMode } from '../../utils/video-config-utils';
import { shouldReduceMotion } from '../../utils/animation-utils';
import { evaluateJsonLogic } from '../../utils/json-logic-utils';

import { ViewportComponent } from '../viewport/viewport.component';
import { CanvasStageComponent } from '../canvas-stage/canvas-stage.component';
import { CanvasCameraService, CameraState } from '../../services/canvas-camera.service';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { LanguageModalComponent } from '../modals/language-modal/language-modal.component';
import { ThumbnailStripComponent } from '../overlays/thumbnail-strip/thumbnail-strip.component';
import { TocOverlayComponent } from '../modals/toc-overlay/toc-overlay.component';
import { SettingsModalComponent } from '../modals/settings-modal/settings-modal.component';
import { CharacterRosterComponent } from '../modals/character-roster/character-roster.component';
import { ExtrasViewerComponent } from '../modals/extras-viewer/extras-viewer.component';
import { ShareModalComponent } from '../modals/share-modal/share-modal.component';
import { CommentsDrawerComponent } from '../modals/comments-drawer/comments-drawer.component';
import { PwIconComponent } from '../icon/pw-icon.component';

/**
 * Factory function for TranslateLoader
 */
export function createTranslateLoader(http: HttpClient): TranslateLoader {
  // Use CustomTranslateLoader to load JSON translation files
  return new CustomTranslateLoader(http);
}

/**
 * Entitlement adapter interface
 * Provides entitlement and paywall functionality
 */
export interface EntitlementAdapter {
  /**
   * Check if user has access to a specific panel
   */
  hasAccess(panelId: string): Promise<boolean>;

  /**
   * Get entitlement context
   */
  getContext(): Promise<Record<string, unknown>>;

  /**
   * Handle purchase flow
   */
  purchase?(productId: string): Promise<boolean>;
}

/**
 * Player Shell Component
 * Main orchestrator for the PanelWave player
 */
@Component({
    selector: 'pw-player-shell',
    providers: [CanvasCameraService],
    imports: [
    TranslateModule,
    ViewportComponent,
    CanvasStageComponent,
    ToolbarComponent,
    ThumbnailStripComponent,
    TocOverlayComponent,
    SettingsModalComponent,
    LanguageModalComponent,
    CharacterRosterComponent,
    ExtrasViewerComponent,
    ShareModalComponent,
    CommentsDrawerComponent,
    PwIconComponent
],
    templateUrl: './player-shell.component.html',
    styleUrls: ['./player-shell.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerShellComponent implements OnInit, OnDestroy {
  /**
   * Manifest to load
   */
  @Input() manifest?: PanelWaveManifest;

  /**
   * Manifest URL (alternative to providing manifest directly)
   */
  @Input() manifestUrl?: string;

  /**
   * Entitlement adapter for paywall integration
   */
  @Input() entitlementAdapter?: EntitlementAdapter;

  /**
   * Initial locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Initial chapter ID
   */
  @Input() initialChapterId?: string;

  /**
   * Initial panel ID
   */
  @Input() initialPanelId?: string;

  /**
   * Enable autoplay
   */
  @Input() autoplay = false;

  /**
   * Seconds per panel in autoplay mode
   */
  @Input() secondsPerPanel = 5;

  /**
   * Enable reduced motion
   */
  @Input() reducedMotion = false;

  /**
   * Show toolbar by default
   */
  @Input() showToolbar = false;

  /**
   * View-mode override for hosts (e.g. the CMS preview harness):
   * 'auto' (default) keeps the manifest-driven behavior (canvas chapters
   * auto-enter canvas view); 'panel' forces classic panel view; 'canvas'
   * enters canvas view whenever the chapter allows it.
   */
  @Input() viewModeOverride: 'auto' | 'panel' | 'canvas' = 'auto';

  /**
   * Player ready
   */
  @Output() ready = new EventEmitter<void>();

  /**
   * Panel changed
   */
  @Output() panelChange = new EventEmitter<{ panel: Panel; chapter: Chapter }>();

  /**
   * Chapter changed
   */
  @Output() chapterChange = new EventEmitter<Chapter>();

  /**
   * Error occurred
   */
  @Output() error = new EventEmitter<Error>();

  /**
   * Locale changed
   */
  @Output() localeChange = new EventEmitter<LocaleCode>();

  /**
   * Variable changed
   */
  @Output() variableChange = new EventEmitter<{ key: string; value: unknown }>();

  /**
   * Navigation attempted
   */
  @Output() navigationAttempt = new EventEmitter<{ direction: 'next' | 'previous' | 'panel'; target?: string }>();

  /**
   * Camera moved in canvas view (throttled).
   */
  @Output() cameraChange = new EventEmitter<CameraState>();

  /**
   * Destroy subject
   */
  private destroy$ = new Subject<void>();

  /**
   * Loading state
   */
  loading = true;

  /**
   * Error state
   */
  hasError = false;

  /**
   * Error message
   */
  errorMessage = '';

  /**
   * Current panel
   */
  currentPanel?: Panel;

  /**
   * Transition for the current panel change, passed to the viewport
   * (resolved edge transition on next, reversed edge transition on
   * previous, null for jumps).
   */
  viewportTransition: Transition | null = null;

  /**
   * Current page (for page view)
   */
  currentPage?: Page;

  /**
   * Current chapter
   */
  currentChapter?: Chapter;

  /**
   * Toolbar visibility
   */
  toolbarVisible = false;

  /**
   * Modal visibility states
   */
  tocVisible = false;
  settingsVisible = false;
  languageModalVisible = false;
  charactersVisible = false;
  extrasVisible = false;
  shareVisible = false;
  commentsVisible = false;
  thumbnailsVisible = false;

  /**
   * View mode
   */
  viewMode: ViewMode = 'panel';

  /**
   * Page view available (has pages defined)
   */
  pageViewAvailable = false;

  /**
   * Canvas view available for the current chapter (chapter has a canvas
   * layout AND some output preset enables canvasView — schema 1.4).
   */
  canvasViewAvailable = false;

  /**
   * Panels the trail has visited in the current chapter (drives canvas
   * reveal modes and revisit-jumps).
   */
  visitedPanelIds: string[] = [];

  /**
   * Autoplay timer
   */
  private autoplayTimer?: ReturnType<typeof setTimeout>;

  /**
   * Autoplay enabled state
   */
  autoplayEnabled = false;

  /**
   * Speech-bubble toggle state. Every bubble is implicitly subject to this
   * (schema 1.3) — per-bubble visibleIf is reserved for story logic.
   * Initialized from the manifest's settings.ui.speechDefault.
   */
  speechEnabled = true;

  /**
   * Autoplay progress (0-100)
   */
  autoplayProgress = 0;

  /**
   * Autoplay progress interval
   */
  private autoplayProgressInterval?: ReturnType<typeof setInterval>;

  /**
   * Autoplay start time
   */
  private autoplayStartTime = 0;

  /**
   * Autoplay duration for current panel
   */
  private autoplayDuration = 0;

  /**
   * Video layer ids of the current panel that still owe a pass completion
   * before autoplay may advance (panel view, video panels — §4.5). Empty when
   * the wall-clock timer drives the advance instead.
   */
  private pendingVideoPasses = new Set<string>();

  /**
   * Fallback watchdog for panel-view on-view video panels (§4.5): guards
   * against a video that never reports a pass (corrupt/unreachable source
   * stalling forever) by force-advancing after a bounded wait. Canceled
   * when every pending video's pass arrives first, or when autoplay stops.
   */
  private videoWatchdogTimer?: ReturnType<typeof setTimeout>;

  /**
   * The panel the currently-armed watchdog belongs to. Any navigation away
   * from it invalidates a late-firing watchdog even if the timer itself
   * hasn't been cleared yet (belt-and-braces against a double advance).
   */
  private videoWatchdogPanel?: Panel;

  private readonly trackingService = inject(TrackingService);
  private readonly videoController = inject(VideoControllerService);
  private readonly videoSequencer = inject(VideoSequencerService);

  /**
   * Reading order per panel id (1-based, across chapters), computed once per
   * manifest. Reported as `panelOrder` on panel_view / funnel events and as
   * `totalPanels` on session_start so the backend can compute exact
   * completion and funnel steps.
   */
  private analyticsPanelOrder = new Map<string, number>();
  private analyticsTotalPanels = 0;

  /** Analytics session lifecycle guards (one session per shell instance). */
  private analyticsSessionStarted = false;
  private analyticsSessionEnded = false;
  private workCompleteTracked = false;
  private lastTrackedPanelId?: string;

  /** Bound pagehide handler so add/removeEventListener match. */
  private readonly onPageHide = (): void => this.endAnalyticsSession();

  constructor(
    private playerState: PlayerStateService,
    private manifestService: ManifestService,
    private variableStore: VariableStoreService,
    private flowEngine: FlowEngineService,
    private translationService: TranslationService,
    private canvasCamera: CanvasCameraService
  ) {}

  /**
   * Initialize component
   */
  ngOnInit(): void {
    this.toolbarVisible = this.showToolbar;
    this.subscribeToVideoSignals();
    this.initializePlayer();
    // pagehide fires for both tab close and navigation (incl. bfcache) —
    // the last chance to flush the analytics queue.
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
    }
  }

  /**
   * Cleanup on destroy
   */
  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
    }
    this.endAnalyticsSession();
    this.stopAutoplay();
    this.stopAutoplayProgress();
    this.videoSequencer.reset();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Subscribe to the media-driven auto-advance signals:
   * - `VideoControllerService.passComplete$` drives panel-view advance for
   *   video panels (precise, media-event based — §4.5);
   * - `VideoSequencerService.queueComplete` drives page-view advance once the
   *   last visible on-view video finished one pass (§4.3 step 6).
   * Both only navigate while autoplay is enabled.
   */
  private subscribeToVideoSignals(): void {
    this.videoController.passComplete$
      .pipe(takeUntil(this.destroy$))
      .subscribe((videoId) => this.onVideoPassComplete(videoId));

    this.videoSequencer.queueComplete
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.onVideoQueueComplete());
  }

  /** Panel-view auto-advance for video panels (§4.5). */
  private onVideoPassComplete(videoId: string): void {
    if (
      !this.autoplayEnabled ||
      this.viewMode !== 'panel' ||
      this.pendingVideoPasses.size === 0 ||
      !this.pendingVideoPasses.has(videoId)
    ) {
      return;
    }
    this.pendingVideoPasses.delete(videoId);
    // Multiple video layers in one panel: advance when the longest pass
    // (i.e. the last outstanding video) completes.
    if (this.pendingVideoPasses.size > 0) {
      return;
    }
    // Media-driven advance won the race — the stall watchdog is now moot.
    this.clearVideoWatchdog();
    void this.navigateNext().then(() => {
      if (this.autoplayEnabled) {
        this.startAutoplay();
      }
    });
  }

  /** Page-view auto-advance when the video queue finishes (§4.3 step 6). */
  private onVideoQueueComplete(): void {
    if (!this.autoplayEnabled || this.viewMode !== 'page') {
      return;
    }
    this.navigateToNextPage();
  }

  /**
   * Initialize player
   */
  private async initializePlayer(): Promise<void> {
    try {
      this.loading = true;

      // Load manifest
      if (this.manifestUrl) {
        await this.loadManifestFromUrl(this.manifestUrl);
      } else if (this.manifest) {
        await this.manifestService.loadManifestFromObject(this.manifest).toPromise();
      } else {
        throw new Error('No manifest or manifestUrl provided');
      }

      // Initialize entitlement context
      if (this.entitlementAdapter) {
        const context = await this.entitlementAdapter.getContext();
        Object.entries(context).forEach(([key, value]) => {
          this.variableStore.set(key, value, 'global');
        });
      }

      // Set initial locale and configure translations
      this.playerState.setLocale(this.locale);
      this.translationService.setLanguage(this.locale);

      // Check if page view is available
      const loadedManifest = this.manifestService.getManifest();
      if (loadedManifest?.chapters) {
        const chapters = Object.values(loadedManifest.chapters);
        this.pageViewAvailable = chapters.some(chapter =>
          chapter.pages && chapter.pages.length > 0
        );
      }

      // Initial speech-toggle state from the work's settings (default: on)
      this.speechEnabled = loadedManifest?.settings?.ui?.speechDefault !== false;

      // Configure tracking (consent requirements + event whitelist) from the
      // manifest so video events flow through the consent/whitelist pipeline.
      this.configureTracking(loadedManifest);

      // Navigate to initial position
      if (this.initialChapterId && this.initialPanelId) {
        await this.navigateToPanel(this.initialChapterId, this.initialPanelId);
      } else if (this.initialChapterId) {
        await this.navigateToChapter(this.initialChapterId);
      } else {
        await this.navigateToStart();
      }

      // Subscribe to state changes
      this.subscribeToStateChanges();

      this.loading = false;
      this.ready.emit();
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Configure the TrackingService from the manifest's `tracking` section:
   * consent requirement, event whitelist and endpoint. Consent itself follows
   * the manifest's `defaultOptIn` (until an explicit consent UI overrides it
   * via `PlayerStateService.setTrackingConsent`).
   */
  private configureTracking(manifest: PanelWaveManifest | null): void {
    const tracking = manifest?.tracking;
    if (!tracking) {
      return;
    }
    this.trackingService.configure({
      consentRequired: tracking.consent?.required ?? true,
      eventWhitelist: tracking.eventWhitelist,
      endpoint: tracking.endpoint,
    });
    if (tracking.consent?.defaultOptIn) {
      this.trackingService.setConsent(true);
    }

    // TrackingService's UUID is the single analytics session ID (embedding
    // hosts can override it via TrackingService.setSessionId before init).
    this.startAnalyticsSession(manifest!);
  }

  /**
   * Open the analytics session: compute the reading order across chapters
   * (graph traversal from each chapter's entry) and emit `session_start`
   * with device/locale/work-size context. Runs before the initial
   * navigation, so session_start precedes the first panel_view.
   */
  private startAnalyticsSession(manifest: PanelWaveManifest): void {
    if (this.analyticsSessionStarted) {
      return;
    }
    this.analyticsSessionStarted = true;

    this.analyticsPanelOrder.clear();
    let order = 0;
    for (const chapter of manifest.chapters ?? []) {
      for (const panelId of this.readingOrderForChapter(chapter)) {
        if (!this.analyticsPanelOrder.has(panelId)) {
          this.analyticsPanelOrder.set(panelId, ++order);
        }
      }
    }
    this.analyticsTotalPanels = order;

    this.trackingService.track('session_start', {
      deviceType: this.detectDeviceType(),
      locale: this.locale,
      totalPanels: this.analyticsTotalPanels,
    });
  }

  /**
   * Deterministic reading order for a chapter: breadth-first over the graph
   * from the entry panel(s), then any unreachable panels in declaration
   * order (branching narratives have no single true order — BFS approximates
   * "distance from start", which is what the funnel needs).
   */
  private readingOrderForChapter(chapter: Chapter): string[] {
    const orderedIds: string[] = [];
    const seen = new Set<string>();
    const graph = chapter.graph;

    const entry = graph ? this.flowEngine.getEntry(graph) : undefined;
    const queue: string[] = entry === undefined ? [] : typeof entry === 'string' ? [entry] : [...entry];

    while (queue.length > 0) {
      const panelId = queue.shift()!;
      if (seen.has(panelId)) {
        continue;
      }
      seen.add(panelId);
      orderedIds.push(panelId);
      for (const edge of graph?.edges ?? []) {
        if (edge.from === panelId && !seen.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }

    for (const panelId of Object.keys(chapter.panels ?? {})) {
      if (!seen.has(panelId)) {
        orderedIds.push(panelId);
      }
    }
    return orderedIds;
  }

  /**
   * Coarse device class for analytics breakdowns (matches the dashboard's
   * device segments): touch + narrow = phone, touch + wide = tablet,
   * everything else desktop.
   */
  private detectDeviceType(): string {
    if (typeof window === 'undefined') {
      return 'desktop';
    }
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    if (coarsePointer) {
      return window.innerWidth < 768 ? 'phone' : 'tablet';
    }
    return 'desktop';
  }

  /**
   * Track a panel view (deduplicated against immediate re-emissions of the
   * same panel) and, on reaching an end panel of the last chapter, the
   * one-time `work_complete` signal.
   */
  private trackPanelView(panel: Panel, chapter: Chapter): void {
    // Panels don't carry their own id — resolve it from the chapter's map
    // (same identity lookup as getCurrentPanelId).
    const panelId = Object.entries(chapter.panels ?? {}).find(([, p]) => p === panel)?.[0];
    if (!panelId || panelId === this.lastTrackedPanelId) {
      return;
    }
    this.lastTrackedPanelId = panelId;

    this.trackingService.track('panel_view', {
      panelId,
      chapterId: chapter.id,
      panelOrder: this.analyticsPanelOrder.get(panelId) ?? 0,
    });

    if (!this.workCompleteTracked && this.isEndOfWork(panelId, chapter)) {
      this.workCompleteTracked = true;
      this.trackingService.track('work_complete', {
        panelId,
        chapterId: chapter.id,
      });
    }
  }

  /** An end panel (no outgoing edges) of the manifest's last chapter. */
  private isEndOfWork(panelId: string, chapter: Chapter): boolean {
    const chapters = this.manifestService.getManifest()?.chapters ?? [];
    if (chapters.length > 0 && chapters[chapters.length - 1]?.id !== chapter.id) {
      return false;
    }
    return !(chapter.graph?.edges ?? []).some((edge) => edge.from === panelId);
  }

  /**
   * Close the analytics session exactly once: emit `session_end` and flush
   * the queue via sendBeacon (survives tab close / navigation).
   */
  private endAnalyticsSession(): void {
    if (!this.analyticsSessionStarted || this.analyticsSessionEnded) {
      return;
    }
    this.analyticsSessionEnded = true;
    this.trackingService.track('session_end', {});
    this.trackingService.flushSync();
  }

  /**
   * Load manifest from URL
   */
  private async loadManifestFromUrl(url: string): Promise<void> {
    // In a real implementation, this would fetch the manifest
    // For now, we'll throw an error to indicate it's not implemented
    throw new Error('Manifest URL loading not yet implemented');
  }

  /**
   * Subscribe to state changes
   */
  private subscribeToStateChanges(): void {
    // Listen to panel changes
    this.playerState.currentPanel$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panel) => {
        if (panel && this.currentChapter) {
          this.currentPanel = panel;
          this.panelChange.emit({ panel, chapter: this.currentChapter });
          this.trackPanelView(panel, this.currentChapter);
        }
      });

    // Listen to locale changes
    this.playerState.locale$
      .pipe(takeUntil(this.destroy$))
      .subscribe((locale) => {
        this.localeChange.emit(locale);
      });
  }

  /**
   * Navigate to start
   */
  private async navigateToStart(): Promise<void> {
    const manifest = this.manifestService.getManifest();
    if (!manifest) {
      throw new Error('No manifest loaded');
    }

    // Get first chapter
    const firstChapter = manifest.chapters[0];
    if (!firstChapter) {
      throw new Error('No chapters in manifest');
    }

    await this.navigateToChapter(firstChapter.id);
  }

  /**
   * Navigate to chapter
   */
  async navigateToChapter(chapterId: string): Promise<void> {
    try {
      const chapter = this.manifestService.getChapter(chapterId);
      if (!chapter) {
        throw new Error(`Chapter not found: ${chapterId}`);
      }

      this.currentChapter = chapter;
      this.chapterChange.emit(chapter);
      this.visitedPanelIds = [];
      this.updateCanvasAvailability();

      // Get first panel in chapter from graph entry
      const entry = this.flowEngine.getEntry(chapter.graph);
      const firstPanelId = typeof entry === 'string' ? entry : entry[0];
      if (firstPanelId) {
        const panelData = this.manifestService.getPanel(firstPanelId);
        if (panelData) {
          this.playerState.setCurrentPanel(panelData.panel);
          this.currentPanel = panelData.panel;
        }
      }
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Navigate to panel
   * @param transition - Optional transition to render for this panel change
   *   (already resolved against the outputPresets default). Omitted for
   *   non-adjacent jumps (TOC, initial load), which swap instantly.
   */
  async navigateToPanel(
    chapterId: string,
    panelId: string,
    transition?: Transition,
    cameraMove?: CameraMove
  ): Promise<void> {
    try {
      this.viewportTransition = transition ?? null;
      // Check entitlement
      if (this.entitlementAdapter) {
        const hasAccess = await this.entitlementAdapter.hasAccess(panelId);
        if (!hasAccess) {
          throw new Error(`Access denied to panel: ${panelId}`);
        }
      }

      const chapter = this.manifestService.getChapter(chapterId);
      if (!chapter) {
        throw new Error(`Chapter not found: ${chapterId}`);
      }

      const panelData = this.manifestService.getPanel(panelId);
      if (!panelData) {
        throw new Error(`Panel not found: ${panelId}`);
      }

      const chapterChanged = this.currentChapter !== chapter;
      const leavingPanelId = this.getCurrentPanelId();
      this.currentChapter = chapter;
      this.currentPanel = panelData.panel;
      this.playerState.setCurrentPanel(panelData.panel);

      if (chapterChanged) {
        this.visitedPanelIds = [];
        this.updateCanvasAvailability();
      }
      if (leavingPanelId && !chapterChanged && !this.visitedPanelIds.includes(leavingPanelId)) {
        this.visitedPanelIds = [...this.visitedPanelIds, leavingPanelId];
      }
      if (!this.visitedPanelIds.includes(panelId)) {
        this.visitedPanelIds = [...this.visitedPanelIds, panelId];
      }

      // Canvas view: glide the camera to the target panel's framing.
      if (this.viewMode === 'canvas') {
        this.flyCameraToPanel(chapter, panelId, cameraMove);
      }

      this.panelChange.emit({ panel: panelData.panel, chapter });
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Canvas view is available when the current chapter has a canvas layout
   * and at least one output preset enables `canvasView` (the player does not
   * track an active output format — same pragmatic rule as
   * `FlowEngineService.getDefaultTransition`). Entering a canvas chapter
   * auto-switches to canvas view; leaving one falls back to panel view.
   */
  private updateCanvasAvailability(): void {
    const presets = this.manifestService.getManifest()?.settings?.outputPresets ?? {};
    const enabled = Object.values(presets).some((preset) => preset?.canvasView === true);
    this.canvasViewAvailable = enabled && !!this.currentChapter?.canvas;

    if (this.viewModeOverride === 'panel') {
      if (this.viewMode === 'canvas') {
        this.viewMode = 'panel';
      }
      return;
    }
    if (this.canvasViewAvailable && this.viewMode === 'panel') {
      this.viewMode = 'canvas';
    } else if (!this.canvasViewAvailable && this.viewMode === 'canvas') {
      this.viewMode = 'panel';
    }
  }

  /**
   * Fly (or, under reduced motion, jump) the canvas camera to a panel's
   * authored framing. The camera service caps travel speed; user input
   * during the glide cancels it (the reader owns the camera).
   */
  private flyCameraToPanel(chapter: Chapter, panelId: string, cameraMove?: CameraMove): void {
    const placement = chapter.canvas?.placements?.[panelId];
    if (!placement) {
      return;
    }
    const target = this.canvasCamera.frameForPlacement(placement);
    if (this.reducedMotion || shouldReduceMotion()) {
      // Reduced motion: no gliding, ever. (CameraMove.reducedMotionFallback
      // degrades to an instant reframe; a cross-fade is a future refinement.)
      this.canvasCamera.jumpTo(target);
      return;
    }
    void this.canvasCamera.flyTo(
      target,
      cameraMove ?? this.flowEngine.getDefaultCameraMove(this.manifestService.getManifest()?.settings)
    );
  }

  /**
   * Navigate to next panel
   */
  async navigateNext(): Promise<void> {
    if (!this.currentChapter || !this.currentPanel) {
      return;
    }

    this.navigationAttempt.emit({ direction: 'next' });

    try {
      const context = this.variableStore.createContext(this.currentChapter.id);
      const currentPanelId = this.getCurrentPanelId();
      if (!currentPanelId) return;

      const result = this.flowEngine.getNextPanel(
        this.currentChapter.graph,
        currentPanelId,
        context,
        this.flowEngine.getDefaultTransition(this.manifestService.getManifest()?.settings),
        this.flowEngine.getDefaultCameraMove(this.manifestService.getManifest()?.settings)
      );

      if (result.nextPanelId) {
        await this.navigateToPanel(
          this.currentChapter.id,
          result.nextPanelId,
          result.transition,
          result.cameraMove
        );
      }
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Navigate to previous panel
   */
  async navigatePrevious(): Promise<void> {
    if (!this.currentChapter || !this.currentPanel) {
      return;
    }

    this.navigationAttempt.emit({ direction: 'previous' });

    try {
      const currentPanelId = this.getCurrentPanelId();
      if (!currentPanelId) return;

      const previousPanels = this.flowEngine.getPreviousPanels(
        this.currentChapter.graph,
        currentPanelId
      );

      if (previousPanels.length > 0) {
        // Navigate to the first previous panel, replaying the traversed
        // edge's transition in reverse (slide left becomes slide right).
        const transition = this.flowEngine.getReturnTransition(
          this.currentChapter.graph,
          previousPanels[0],
          currentPanelId,
          this.flowEngine.getDefaultTransition(this.manifestService.getManifest()?.settings)
        );
        const cameraMove = this.flowEngine.getReturnCameraMove(
          this.currentChapter.graph,
          previousPanels[0],
          currentPanelId,
          this.flowEngine.getDefaultCameraMove(this.manifestService.getManifest()?.settings)
        );
        await this.navigateToPanel(this.currentChapter.id, previousPanels[0], transition, cameraMove);
      }
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Toggle toolbar visibility
   */
  toggleToolbar(): void {
    this.toolbarVisible = !this.toolbarVisible;
  }

  /**
   * Show toolbar
   */
  showToolbarTemporarily(): void {
    this.toolbarVisible = true;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (this.toolbarVisible) {
        this.toolbarVisible = false;
      }
    }, 5000);
  }

  /**
   * Change locale
   */
  changeLocale(locale: LocaleCode): void {
    this.playerState.setLocale(locale);
  }

  /**
   * Set variable
   */
  setVariable(key: string, value: unknown, scope: 'global' | 'chapter' | 'page' | 'session' | 'persistent' = 'session'): void {
    this.variableStore.set(key, value, scope);
    this.variableChange.emit({ key, value });
  }

  /**
   * Get variable
   */
  getVariable(key: string, scope: 'global' | 'chapter' | 'page' | 'session' | 'persistent' = 'session', scopeId?: string): unknown {
    return this.variableStore.get(key, scope, scopeId);
  }

  /**
   * Get current panel ID
   */
  getCurrentPanelId(): string | undefined {
    if (!this.currentPanel || !this.currentChapter) return undefined;
    
    // Find the panel ID by searching in the chapter's panels
    for (const [panelId, panel] of Object.entries(this.currentChapter.panels)) {
      if (panel === this.currentPanel) {
        return panelId;
      }
    }
    
    return undefined;
  }

  /**
   * Handle error
   */
  private handleError(err: Error): void {
    console.error('Player error:', err);
    this.hasError = true;
    this.errorMessage = err.message;
    this.loading = false;
    this.error.emit(err);
  }

  /**
   * Toolbar event handlers
   */
  onToggleView(): void {
    // Cycle through the modes available for the current chapter:
    // panel -> page (if pages exist) -> canvas (if canvas exists) -> panel.
    // Page view keeps its historical behavior of being attempted whenever a
    // page contains the current panel, even without the manifest-level flag.
    const modes: ViewMode[] = ['panel'];
    if (this.pageViewAvailable || this.findPageContainingPanel()) {
      modes.push('page');
    }
    if (this.canvasViewAvailable) {
      modes.push('canvas');
    }
    const newMode = modes[(modes.indexOf(this.viewMode) + 1) % modes.length];

    if (newMode === 'page') {
      // Switch to page view - find page containing current panel
      this.currentPage = this.findPageContainingPanel();
      if (this.currentPage) {
        this.viewMode = 'page';
        // Start the page-view video sequence; video components register as
        // they render and visibility drives the queue.
        this.videoSequencer.start();
      } else {
        console.warn('No page found for current panel');
      }
    } else if (newMode === 'canvas') {
      this.viewMode = 'canvas';
      this.videoSequencer.reset();
      // Land the camera on the current panel when entering canvas view.
      if (this.currentChapter) {
        const panelId = this.getCurrentPanelId();
        if (panelId) {
          const placement = this.currentChapter.canvas?.placements?.[panelId];
          if (placement) {
            this.canvasCamera.jumpTo(this.canvasCamera.frameForPlacement(placement));
          }
        }
      }
    } else {
      // Switch to panel view
      this.viewMode = 'panel';
      this.videoSequencer.reset();
    }

    // Re-arm autoplay for the new view mode (video panels vs wall clock).
    if (this.autoplayEnabled) {
      this.startAutoplay();
    }

    console.log('View mode:', this.viewMode);
  }

  /**
   * Tap on a placed panel in canvas view. Traverses the matching out-edge of
   * the current panel when its condition passes (the graph still gates
   * movement); otherwise allows a revisit-jump to already-visited panels.
   * Taps on unrelated panels are ignored — free roaming never mutates story
   * state.
   */
  onCanvasPanelTap(panelId: string): void {
    if (!this.currentChapter) {
      return;
    }
    const currentPanelId = this.getCurrentPanelId();
    if (!currentPanelId || panelId === currentPanelId) {
      return;
    }
    const context = this.variableStore.createContext(this.currentChapter.id);
    const edge = this.currentChapter.graph.edges.find(
      (candidate) =>
        candidate.from === currentPanelId &&
        candidate.to === panelId &&
        (!candidate.condition || evaluateJsonLogic(candidate.condition, context))
    );
    if (edge) {
      this.navigationAttempt.emit({ direction: 'panel', target: panelId });
      void this.navigateToPanel(
        this.currentChapter.id,
        panelId,
        edge.transition,
        edge.cameraMove ??
          this.flowEngine.getDefaultCameraMove(this.manifestService.getManifest()?.settings)
      );
      return;
    }
    if (this.visitedPanelIds.includes(panelId)) {
      this.navigationAttempt.emit({ direction: 'panel', target: panelId });
      void this.navigateToPanel(this.currentChapter.id, panelId);
    }
  }

  /** Balloon defaults for the canvas stage (same source as the viewport). */
  get manifestBalloonConfig(): BalloonConfig | null {
    return this.manifestService.getManifest()?.settings?.typography?.balloon_config ?? null;
  }

  /** Manifest characters for speech-bubble styling in canvas view. */
  get manifestCharacters(): ManifestCharacter[] {
    return this.manifestService.getManifest()?.meta?.characters ?? [];
  }

  onLocaleChange(locale: LocaleCode): void {
    // Update content locale
    this.locale = locale;
    this.playerState.setLocale(locale);
    
    // Update GUI language (sync with content locale)
    this.translationService.setLanguage(locale);
    
    console.log('Locale changed to:', locale);
  }

  onToggleSpeech(): void {
    this.speechEnabled = !this.speechEnabled;
  }

  onToggleAudio(): void {
    console.log('Toggle audio - not yet implemented');
  }

  onToggleSfx(): void {
    console.log('Toggle SFX - not yet implemented');
  }

  onToggleAutoplay(): void {
    this.autoplayEnabled = !this.autoplayEnabled;
    
    if (this.autoplayEnabled) {
      this.startAutoplay();
    } else {
      this.stopAutoplay();
    }
  }

  onSecondsPerPanelChange(seconds: number): void {
    this.secondsPerPanel = seconds;
    
    // Restart autoplay if active to apply new timing
    if (this.autoplayEnabled) {
      this.stopAutoplay();
      this.startAutoplay();
    }
  }

  onToggleThumbnails(): void {
    this.thumbnailsVisible = !this.thumbnailsVisible;
  }

  onOpenToc(): void {
    this.tocVisible = true;
  }

  onOpenSettings(): void {
    this.settingsVisible = true;
  }

  onOpenCharacters(): void {
    this.charactersVisible = true;
  }

  onCycleAlternative(): void {
    console.log('Cycle alternative panels - not yet implemented');
  }

  onShowBranches(): void {
    console.log('Show branch choices - not yet implemented');
  }

  onOpenExtras(): void {
    this.extrasVisible = true;
  }

  onLike(): void {
    console.log('Like action - not yet implemented');
  }

  onBookmark(): void {
    console.log('Bookmark action - not yet implemented');
  }

  onShare(): void {
    this.shareVisible = true;
  }

  onOpenComments(): void {
    this.commentsVisible = true;
  }

  /**
   * Modal close handlers
   */
  onTocClose(): void {
    this.tocVisible = false;
  }

  onSettingsClose(): void {
    this.settingsVisible = false;
  }

  onCharactersClose(): void {
    this.charactersVisible = false;
  }

  onExtrasClose(): void {
    this.extrasVisible = false;
  }

  onShareClose(): void {
    this.shareVisible = false;
  }

  onCommentsClose(): void {
    this.commentsVisible = false;
  }

  onThumbnailsClose(): void {
    this.thumbnailsVisible = false;
  }

  /**
   * Handle ToC navigation
   */
  onTocNavigate(target: { chapterId: string; panelId?: string }): void {
    this.tocVisible = false;
    if (target.panelId) {
      this.navigateToPanel(target.chapterId, target.panelId);
    } else {
      this.navigateToChapter(target.chapterId);
    }
  }

  /**
   * Handle thumbnail navigation
   */
  onThumbnailNavigate(target: { chapterId: string; panelId: string }): void {
    this.navigateToPanel(target.chapterId, target.panelId);
  }

  /**
   * Keyboard shortcut handler
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    // Don't handle if user is typing in an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        if (this.viewMode === 'page') {
          this.navigateToNextPage();
        } else {
          this.navigateNext();
        }
        break;

      case 'ArrowLeft':
        event.preventDefault();
        if (this.viewMode === 'page') {
          this.navigateToPreviousPage();
        } else {
          this.navigatePrevious();
        }
        break;

      case 't':
      case 'T':
        event.preventDefault();
        this.toggleToolbar();
        break;

      case 'o':
      case 'O':
        // Canvas overview: see the whole shape of the story.
        if (this.viewMode === 'canvas') {
          event.preventDefault();
          void this.canvasCamera.toggleOverview(!(this.reducedMotion || shouldReduceMotion()));
        }
        break;

      case '+':
      case '=':
        if (this.viewMode === 'canvas') {
          event.preventDefault();
          this.canvasZoomAtCenter(1.25);
        }
        break;

      case '-':
      case '_':
        if (this.viewMode === 'canvas') {
          event.preventDefault();
          this.canvasZoomAtCenter(0.8);
        }
        break;

      case 'Escape':
        event.preventDefault();
        if (this.toolbarVisible) {
          this.toolbarVisible = false;
        }
        break;
    }
  }

  /**
   * Handle viewport click
   */
  onViewportClick(): void {
    this.showToolbarTemporarily();
  }

  /** Keyboard zoom for canvas view (viewport-center anchored). */
  private canvasZoomAtCenter(factor: number): void {
    this.canvasCamera.zoomAtCenter(factor);
  }

  /**
   * Handle swipe gesture
   */
  onSwipe(direction: 'left' | 'right' | 'up' | 'down'): void {
    if (direction === 'left') {
      // Swipe left = navigate forward
      if (this.viewMode === 'page') {
        this.navigateToNextPage();
      } else {
        this.navigateNext();
      }
    } else if (direction === 'right') {
      // Swipe right = navigate backward
      if (this.viewMode === 'page') {
        this.navigateToPreviousPage();
      } else {
        this.navigatePrevious();
      }
    }
  }

  /**
   * Start autoplay.
   *
   * Video-aware (§4.5): in panel view, when the current panel contains
   * `on-view` video layers, the advance is driven by their media events
   * (one full pass each, signalled via `VideoControllerService.passComplete$`)
   * instead of a wall-clock timer — buffering or a user pause can never
   * desync the dwell time. A watchdog ({@link armVideoWatchdog}) covers the
   * case where the media event never arrives at all (corrupt/unreachable
   * source stalling forever). In page view, pages with visible `on-view`
   * videos advance when the sequencer queue completes (§4.3 step 6). All
   * other panels/pages keep the wall-clock `durationMs`/`secondsPerPanel`
   * timer.
   */
  private startAutoplay(): void {
    this.stopAutoplay(); // Clear any existing timer / pending media waits

    if (this.viewMode === 'panel') {
      const videoIds = this.onViewVideoLayerIds(this.currentPanel);
      if (videoIds.length > 0) {
        // Media-event driven: wait for every on-view video's pass (the
        // longest pass wins). Progress display uses durationMs as estimate.
        this.pendingVideoPasses = new Set(videoIds);
        this.autoplayDuration =
          this.currentPanel?.durationMs ?? this.secondsPerPanel * 1000;
        this.autoplayProgress = 0;
        this.autoplayStartTime = Date.now();
        this.startAutoplayProgress();
        this.armVideoWatchdog();
        return;
      }
    } else if (this.viewMode === 'page' && this.pageHasOnViewVideos()) {
      // Page view with on-view videos: the sequencer's queueComplete event
      // advances the page — no wall-clock timer.
      return;
    }

    // Use panel-specific durationMs if available, otherwise use global setting (in seconds)
    const durationMs = this.currentPanel?.durationMs ?? (this.secondsPerPanel * 1000);

    // Ensure we have a valid duration
    if (!durationMs || durationMs <= 0) {
      console.warn('Invalid autoplay duration, using default 5s');
      this.autoplayDuration = 5000;
    } else {
      this.autoplayDuration = durationMs;
    }

    // Reset and start progress tracking
    this.autoplayProgress = 0;
    this.autoplayStartTime = Date.now();
    this.startAutoplayProgress();

    this.autoplayTimer = setTimeout(() => {
      // Continue autoplay if still enabled
      if (this.autoplayEnabled) {
        this.navigateNext();
        // Small delay to let panel change complete, then restart
        setTimeout(() => {
          if (this.autoplayEnabled) {
            this.startAutoplay();
          }
        }, 10);
      }
    }, this.autoplayDuration);
  }

  /**
   * Stop autoplay
   */
  private stopAutoplay(): void {
    if (this.autoplayTimer) {
      clearTimeout(this.autoplayTimer);
      this.autoplayTimer = undefined;
    }
    this.pendingVideoPasses.clear();
    this.clearVideoWatchdog();
    this.stopAutoplayProgress();
    this.autoplayProgress = 0;
  }

  /**
   * Arm the stall-fallback watchdog for the current panel-view video panel.
   * Bound = the panel's effective duration (`durationMs`, falling back to
   * `secondsPerPanel`) plus a grace margin — reusing
   * `VideoSequencerService`'s configurable stall-skip timeout (§7) rather
   * than a hardcoded number, so the page-view and panel-view fallbacks share
   * one knob. If it fires before every pending video reports its pass, the
   * stalled panel is force-advanced exactly like the sequencer's stall-skip.
   */
  private armVideoWatchdog(): void {
    this.clearVideoWatchdog();
    if (typeof setTimeout === 'undefined') {
      return;
    }
    this.videoWatchdogPanel = this.currentPanel;
    const graceMs = this.videoSequencer.getStallTimeout();
    const boundMs = Math.max(0, this.autoplayDuration) + graceMs;
    this.videoWatchdogTimer = setTimeout(() => this.onVideoWatchdogTimeout(), boundMs);
  }

  /** Cancel the video watchdog, if armed, without touching anything else. */
  private clearVideoWatchdog(): void {
    if (this.videoWatchdogTimer) {
      clearTimeout(this.videoWatchdogTimer);
      this.videoWatchdogTimer = undefined;
    }
    this.videoWatchdogPanel = undefined;
  }

  /**
   * The watchdog bound elapsed before every pending video reported a pass.
   * No-ops if autoplay stopped, the view mode changed, the panel navigated
   * away in the meantime (stale timer — belt-and-braces against a double
   * advance), or the media event already won the race. Otherwise: emit the
   * same `VIDEO_ENDED` / `stall-skip` tracking signal the page-view
   * sequencer's stall-skip uses (`VideoLayerComponent.emitStallSkip`) for
   * each still-pending video, then advance.
   */
  private onVideoWatchdogTimeout(): void {
    this.videoWatchdogTimer = undefined;
    if (
      !this.autoplayEnabled ||
      this.viewMode !== 'panel' ||
      this.currentPanel !== this.videoWatchdogPanel ||
      this.pendingVideoPasses.size === 0
    ) {
      return;
    }
    const panelId = this.getCurrentPanelId();
    for (const videoId of this.pendingVideoPasses) {
      this.trackVideoStallSkip(panelId, videoId);
    }
    this.pendingVideoPasses.clear();
    this.videoWatchdogPanel = undefined;
    void this.navigateNext().then(() => {
      if (this.autoplayEnabled) {
        this.startAutoplay();
      }
    });
  }

  /**
   * Emit a `VIDEO_ENDED` tracking event with a `stall-skip` reason for a
   * video the panel-view watchdog force-advanced past — the panel-view
   * counterpart of `VideoLayerComponent.emitStallSkip()` (page view).
   */
  private trackVideoStallSkip(panelId: string | undefined, videoId: string): void {
    const layer = this.currentPanel?.layers?.find((l) => l.id === videoId);
    const assetId = typeof layer?.assetId === 'string' ? layer.assetId : undefined;
    const payload: VideoTrackingPayload = {
      panelId,
      assetId,
      trigger: 'view',
      reason: 'stall-skip',
    };
    this.trackingService.track(
      PlayerEvent.VIDEO_ENDED,
      payload as unknown as Record<string, unknown>
    );
  }

  /**
   * Ids of the given panel's video layers whose *effective* start mode is
   * `on-view` (i.e. the ones that will actually autoplay and produce media
   * events). Mirrors `VideoLayerComponent.effectiveStartMode()`: reduced
   * motion degrades `on-view` to `on-click`.
   */
  private onViewVideoLayerIds(panel: Panel | undefined): string[] {
    if (!panel?.layers) {
      return [];
    }
    const ui = this.manifestService.getManifest()?.settings?.ui;
    const reduced = this.reducedMotion || shouldReduceMotion();
    const ids: string[] = [];
    for (const layer of panel.layers) {
      if (layer.kind !== 'video') {
        continue;
      }
      const startMode = resolveStartMode(layer as Partial<VideoLayer>, ui);
      if (startMode === 'on-view' && !reduced) {
        ids.push(layer.id);
      }
    }
    return ids;
  }

  /** Whether the current page contains any panel with on-view video layers. */
  private pageHasOnViewVideos(): boolean {
    if (!this.currentPage || !this.currentChapter) {
      return false;
    }
    for (const placement of this.currentPage.layout?.placements ?? []) {
      const panel = this.currentChapter.panels[placement.panelId];
      if (this.onViewVideoLayerIds(panel).length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Start autoplay progress tracking
   */
  private startAutoplayProgress(): void {
    this.stopAutoplayProgress();
    
    this.autoplayProgressInterval = setInterval(() => {
      const elapsed = Date.now() - this.autoplayStartTime;
      const progress = Math.min(100, (elapsed / this.autoplayDuration) * 100);
      this.autoplayProgress = progress;
    }, 50); // Update every 50ms for smooth animation
  }

  /**
   * Stop autoplay progress tracking
   */
  private stopAutoplayProgress(): void {
    if (this.autoplayProgressInterval) {
      clearInterval(this.autoplayProgressInterval);
      this.autoplayProgressInterval = undefined;
    }
  }

  /**
   * Find the page that contains the current panel
   */
  private findPageContainingPanel(): Page | undefined {
    if (!this.currentChapter) return undefined;
    
    const currentPanelId = this.getCurrentPanelId();
    if (!currentPanelId) return undefined;
    
    // Search through pages in the current chapter
    const pages = this.currentChapter.pages || [];
    for (const page of pages) {
      // Check if this page's placements include the current panel
      if (page.layout?.placements?.some(p => p.panelId === currentPanelId)) {
        return page;
      }
    }
    
    return undefined;
  }

  /**
   * Navigate to next page (in page view mode)
   */
  navigateToNextPage(): void {
    if (!this.currentChapter?.pages || !this.currentPage) return;
    
    const pages = this.currentChapter.pages;
    const currentIndex = pages.findIndex(p => p.id === this.currentPage!.id);
    
    if (currentIndex === -1 || currentIndex >= pages.length - 1) {
      console.log('Already at last page');
      return;
    }
    
    // Move to next page
    this.currentPage = pages[currentIndex + 1];

    // Update current panel to first panel in reading order
    if (this.currentPage.readingOrder && this.currentPage.readingOrder.length > 0) {
      const firstPanelId = this.currentPage.readingOrder[0];
      this.currentPanel = this.currentChapter.panels[firstPanelId];
    }

    this.onPageChanged();
    console.log('Navigated to next page:', this.currentPage.id);
  }

  /**
   * Restart the page-view video sequence (and autoplay arming) after the
   * current page changed.
   */
  private onPageChanged(): void {
    if (this.viewMode === 'page') {
      this.videoSequencer.start();
    }
    if (this.autoplayEnabled) {
      this.startAutoplay();
    }
  }

  /**
   * Navigate to previous page (in page view mode)
   */
  navigateToPreviousPage(): void {
    if (!this.currentChapter?.pages || !this.currentPage) return;
    
    const pages = this.currentChapter.pages;
    const currentIndex = pages.findIndex(p => p.id === this.currentPage!.id);
    
    if (currentIndex <= 0) {
      console.log('Already at first page');
      return;
    }
    
    // Move to previous page
    this.currentPage = pages[currentIndex - 1];

    // Update current panel to first panel in reading order
    if (this.currentPage.readingOrder && this.currentPage.readingOrder.length > 0) {
      const firstPanelId = this.currentPage.readingOrder[0];
      this.currentPanel = this.currentChapter.panels[firstPanelId];
    }

    this.onPageChanged();
    console.log('Navigated to previous page:', this.currentPage.id);
  }

  // ============================================================================
  // Character helpers
  // ============================================================================

  /**
   * Get available locales from manifest
   */
  get availableLocales(): LocaleCode[] {
    const manifest = this.manifestService.getManifest();
    if (!manifest?.meta?.locales) {
      return ['en-US'];
    }
    return manifest.meta.locales;
  }

  /**
   * Get characters from manifest mapped to roster format
   */
  get characters(): RosterCharacter[] {
    const manifest = this.manifestService.getManifest();
    if (!manifest?.meta?.characters) {
      return [];
    }
    return this.mapCharacters(manifest.meta.characters);
  }

  /**
   * Map manifest characters to roster character format
   */
  private mapCharacters(characters: ManifestCharacter[]): RosterCharacter[] {
    return characters.map(char => ({
      id: char.id,
      name: char.name,
      avatar: char.images?.['portrait'],
      bio: char.description,
      voiceSample: undefined, // Could be added later if needed
      role: undefined, // Could be extracted from description or added to schema
    }));
  }
}
