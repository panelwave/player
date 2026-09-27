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
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
  Hotspot,
  VariableContext,
  VariableDefinition,
  LocalizedString,
  Mutation,
  Edge,
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
import { resolvePanelVariant, resolvePanels } from '../../utils/variant-utils';
import { extrasFromManifest, type CatalogLike } from '../../utils/extras-utils';

import { ViewportComponent } from '../viewport/viewport.component';
import { CanvasStageComponent } from '../canvas-stage/canvas-stage.component';
import { CanvasCameraService, CameraState } from '../../services/canvas-camera.service';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { LanguageModalComponent } from '../modals/language-modal/language-modal.component';
import { ThumbnailStripComponent } from '../overlays/thumbnail-strip/thumbnail-strip.component';
import { TocOverlayComponent } from '../modals/toc-overlay/toc-overlay.component';
import {
  PaywallOverlayComponent,
  type PaywallAction,
} from '../overlays/paywall-overlay/paywall-overlay.component';
import { PaywallService } from '../../services/paywall.service';
import { HttpEntitlementAdapter } from '../../entitlement/http-entitlement.adapter';
import type { EntitlementSnapshot } from '../../entitlement/paywall-evaluator';
import type { PaywallGate } from '../../types/entitlement.types';
import { SettingsModalComponent, type Preferences } from '../modals/settings-modal/settings-modal.component';
import { AudioEngineService } from '../../services/audio-engine.service';
import { PanelAudioService } from '../../services/panel-audio.service';
import { CharacterRosterComponent } from '../modals/character-roster/character-roster.component';
import { ExtrasViewerComponent, type Extra } from '../modals/extras-viewer/extras-viewer.component';
import { ActionModalComponent } from '../modals/action-modal/action-modal.component';
import { AgeGateComponent, type AgeVerificationResult } from '../overlays/age-gate/age-gate.component';
import { BranchChooserComponent, type BranchChoice } from '../modals/branch-chooser/branch-chooser.component';
import { HotspotActionService, type HotspotUiEffect } from '../../services/hotspot-action.service';
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
    PaywallOverlayComponent,
    SettingsModalComponent,
    LanguageModalComponent,
    CharacterRosterComponent,
    ExtrasViewerComponent,
    ActionModalComponent,
    AgeGateComponent,
    BranchChooserComponent,
    ShareModalComponent,
    CommentsDrawerComponent,
    PwIconComponent
],
    templateUrl: './player-shell.component.html',
    styleUrls: ['./player-shell.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerShellComponent implements OnInit, OnChanges, OnDestroy {
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
   * What the reader owns. Supplying this switches the manifest's
   * `paywall.rules` on: gated panels stop navigation and raise the paywall
   * overlay instead of erroring out.
   *
   * Omit it and an anonymous snapshot is used, which is the correct default —
   * a reader who has bought nothing sees the free preview and the gate. A
   * work with no paywall rules is unaffected either way.
   */
  @Input() entitlementSnapshot?: EntitlementSnapshot;

  /**
   * Endpoint that returns the reader's entitlement snapshot, with `{workId}`
   * substituted. When set, the shell fetches the snapshot itself instead of
   * the host passing `entitlementSnapshot`.
   */
  @Input() entitlementEndpoint?: string;

  /** Bearer token identifying the reader to `entitlementEndpoint`. */
  @Input() readerToken?: string;

  /**
   * Emitted when a reader acts on the paywall overlay: `purchase` /
   * `subscribe` (with the chosen option's `productId` — a product id or a
   * subscription tier), `login` or `dismiss`. The host owns checkout — the
   * player never talks to a payment provider itself; call
   * `refreshEntitlements()` (or pass a new `entitlementSnapshot`) afterwards.
   */
  @Output() paywallAction = new EventEmitter<{ action: PaywallAction; gate: PaywallGate; productId?: string }>();

  /**
   * Emitted after the reader answers an `age_gate` rule's overlay (verified or
   * not). The result is also persisted on the device so returning readers are
   * not asked again.
   */
  @Output() ageVerified = new EventEmitter<AgeVerificationResult>();

  /**
   * Emitted when the reader likes / unlikes the work. The like is persisted
   * locally (per work); a host with accounts may mirror it server-side.
   */
  @Output() likeChange = new EventEmitter<{ workId: string; liked: boolean }>();

  /**
   * Emitted when the reader sets / clears the bookmark. The bookmark is
   * persisted locally (per work) and resumed on the next load when the host
   * gives no explicit initial position.
   */
  @Output() bookmarkChange = new EventEmitter<{
    workId: string;
    chapterId: string;
    panelId: string;
    bookmarked: boolean;
  }>();

  /**
   * Host-supplied initial variable values, keyed by variable id and
   * applied once at initialization through a privileged path: unlike
   * runtime mutations, these MAY seed variables the manifest declares
   * `readOnly` — the intended channel for externally-sourced facts
   * (e.g. a verified `user.age` from the host's account system) that
   * in-story content and the settings UI must not be able to change.
   * Values land in each definition's declared scope (global for
   * undeclared ids); the entitlement adapter's context is applied after
   * and wins on collisions.
   */
  @Input() initialVariables?: Record<string, unknown>;

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
   * Force reduced motion (host override). Reduced motion is also on when the
   * reader enabled it in Settings or the OS asks for it — see `motionReduced`.
   */
  @Input() reducedMotion = false;

  /** The reader's in-player "Reduced motion" preference (Settings). */
  private prefReducedMotion = false;
  /** Live `prefers-reduced-motion: reduce` media query. */
  private osReducedMotion = shouldReduceMotion();
  private reducedMotionQuery?: MediaQueryList;
  private readonly onReducedMotionQueryChange = (e: MediaQueryListEvent): void => {
    this.osReducedMotion = e.matches;
    this.cdr.markForCheck();
  };

  /**
   * Effective reduced-motion state for every transition the shell drives
   * (panel/page transitions in the viewport, canvas camera glides): the host
   * input, the reader's setting, or the OS preference.
   */
  get motionReduced(): boolean {
    return this.reducedMotion || this.prefReducedMotion || this.osReducedMotion;
  }

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

  /**
   * Gate blocking the panel the reader tried to open, or null.
   *
   * Held locally rather than in PlayerStateService: the library contains TWO
   * classes of that name — `services/player-state.service.ts` (the one this
   * shell injects and public-api exports) and `state/player-state.service.ts`
   * (which has paywallGate state and showPaywallGate/hidePaywallGate, but is
   * exported nowhere and used by nothing). Reconciling them is a separate
   * change; wiring the paywall through the dead one would be worse than
   * keeping this local.
   */
  paywallGate: PaywallGate | null = null;
  paywallVisible = false;
  /** Product id / tier of the overlay option the reader just picked. */
  paywallProductId?: string;
  /** Adapter built from `entitlementEndpoint`, when the host supplied one. */
  private httpEntitlement?: HttpEntitlementAdapter;

  /**
   * Age gate raised by an `age_gate` paywall rule. The navigation it
   * interrupted is remembered and resumed once the reader passes.
   */
  ageGateVisible = false;
  ageGateMinimumAge = 18;
  private pendingAgeGatedNavigation: {
    chapterId: string;
    panelId: string;
    transition?: Transition;
    cameraMove?: CameraMove;
    mutations?: Mutation[];
  } | null = null;

  /** Reader's like / bookmark for this work (persisted per work on the device). */
  liked = false;
  bookmarked = false;

  /** Branch chooser ("Choices" toolbar button). */
  branchChooserVisible = false;
  branchChoices: BranchChoice[] = [];
  settingsVisible = false;
  languageModalVisible = false;
  charactersVisible = false;
  extrasVisible = false;
  shareVisible = false;
  commentsVisible = false;
  thumbnailsVisible = false;

  /**
   * Action modal state (hotspot openModal action)
   */
  actionModalVisible = false;
  actionModalTitle: LocalizedString | null = null;
  actionModalContent: LocalizedString | null = null;

  /**
   * Extras flattened from the manifest's keyed blocks, plus the item a
   * hotspot openExtras action wants preselected
   */
  extrasList: Extra[] = [];
  extrasInitialId?: string;

  /**
   * Variable context passed to the viewport/canvas for hotspot visibleIf
   * evaluation. Refreshed on navigation and after mutations are applied.
   */
  variableContext: VariableContext | null = null;

  /**
   * Variant-resolved view of the current panel: what the viewport
   * renders and what autoplay/video timing read. Equals `currentPanel`
   * (same reference) when no variant applies. `currentPanel` itself
   * stays the raw manifest panel — identity comparisons depend on it.
   */
  effectivePanel?: Panel;

  /** Id of the variant applied to the current panel, if any. */
  activeVariantId?: string;

  /** Variant-resolved panels of the current chapter (page/canvas views). */
  resolvedPanels: Record<string, Panel> = {};

  /**
   * Manual variant selection per panel id (Alt toolbar cycling):
   * a variant id forces that variant, `null` forces the base panel,
   * absence means automatic condition-based selection. Session-scoped.
   */
  private readonly variantOverrides = new Map<string, string | null>();

  /**
   * The manifest's variable definitions (registered with the store at
   * init; passed to the settings modal's Variables tab).
   */
  variableDefinitions: VariableDefinition[] = [];

  /**
   * Snapshot of current variable values, rebuilt each time the settings
   * modal opens (the modal edits a local copy and emits on save).
   */
  settingsVariableValues: Record<string, unknown> = {};

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
   * Audio toggle state (master mute: every engine bus and video sound).
   * Reader preference when set, else the manifest's settings.ui.audioDefault.
   */
  audioEnabled = true;

  /**
   * SFX toggle state (sfx bus, which also carries `ui` sounds). Reader
   * preference when set, else the manifest's settings.ui.sfxDefault.
   */
  sfxEnabled = true;

  /**
   * Snapshot handed to the settings modal's Preferences tab (rebuilt on open).
   */
  settingsPreferences: Preferences = {
    speech: true,
    audio: true,
    sfx: true,
    autoplay: false,
    secondsPerPanel: 5,
    mangaMode: false,
    reducedMotion: false,
    highContrast: false,
  };

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
  private readonly hotspotAction = inject(HotspotActionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly audioEngine = inject(AudioEngineService);
  private readonly panelAudio = inject(PanelAudioService);

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

  private readonly playerState = inject(PlayerStateService);
  private readonly manifestService = inject(ManifestService);
  private readonly variableStore = inject(VariableStoreService);
  private readonly flowEngine = inject(FlowEngineService);
  private readonly translationService = inject(TranslationService);
  private readonly canvasCamera = inject(CanvasCameraService);
  private readonly paywallService = inject(PaywallService);

  /** ngOnInit ran: later input changes are live updates, not initial values. */
  private initialized = false;
  /** The state subscriptions are set up once per instance, not per (re)load. */
  private stateSubscribed = false;

  /**
   * Initialize component
   */
  ngOnInit(): void {
    this.initialized = true;
    this.toolbarVisible = this.showToolbar;
    this.watchReducedMotion();
    this.subscribeToVideoSignals();
    this.initializePlayer();
    // pagehide fires for both tab close and navigation (incl. bfcache) —
    // the last chance to flush the analytics queue.
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
    }
  }

  /**
   * Inputs changed after init. The first round (before ngOnInit) is skipped:
   * ngOnInit reads every input itself, so nothing loads twice.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.initialized) {
      return;
    }
    if (changes['manifest'] || changes['manifestUrl']) {
      // A new work: reload re-reads every other input as well.
      void this.reload();
      return;
    }
    if (changes['locale']) {
      this.applyLocale();
    }
    if (changes['entitlementSnapshot']) {
      if (!this.entitlementSnapshot && !this.httpEntitlement) {
        this.paywallService.setSnapshot(null);
      }
      this.refreshEntitlements(this.entitlementSnapshot).catch(() => undefined);
    }
    if (changes['viewModeOverride']) {
      this.applyViewModeOverride();
    }
    if (changes['showToolbar']) {
      this.toolbarVisible = this.showToolbar;
    }
    if (changes['autoplay'] && this.autoplay !== this.autoplayEnabled) {
      this.onToggleAutoplay();
    } else if ((changes['secondsPerPanel'] || changes['reducedMotion']) && this.autoplayEnabled) {
      // Re-arm with the new timing / video start modes.
      this.startAutoplay();
    }
    this.cdr.markForCheck();
  }

  /**
   * Reload the work from the current `manifest` / `manifestUrl` inputs
   * (also the error screen's Retry). Story state of the previous load —
   * position, variables except persistent ones, open overlays, autoplay —
   * is reset; the analytics session of the previous work is closed.
   */
  async reload(): Promise<void> {
    this.stopAutoplay();
    this.autoplayEnabled = false;
    this.videoSequencer.reset();
    this.panelAudio.stopAll();
    this.endAnalyticsSession();
    this.analyticsSessionStarted = this.analyticsSessionEnded = this.workCompleteTracked = false;
    this.lastTrackedPanelId = undefined;
    this.closePaywall();
    this.closeAgeGate();
    this.tocVisible = this.settingsVisible = this.languageModalVisible = this.charactersVisible = false;
    this.extrasVisible = this.shareVisible = this.commentsVisible = this.thumbnailsVisible = false;
    this.actionModalVisible = this.branchChooserVisible = false;
    this.variantOverrides.clear();
    this.variableStore.setDefinitions([]);
    for (const scope of ['global', 'chapter', 'page', 'session'] as const) {
      this.variableStore.resetScope(scope);
    }
    this.currentChapter = this.currentPanel = this.currentPage = this.effectivePanel = undefined;
    this.viewMode = 'panel';
    this.visitedPanelIds = [];
    this.httpEntitlement = undefined;
    this.hasError = false;
    this.errorMessage = '';
    await this.initializePlayer();
  }

  /** Content locale + GUI language follow `locale`. */
  private applyLocale(): void {
    this.playerState.setLocale(this.locale);
    this.translationService.setLanguage(this.locale);
  }

  /** Apply a changed `viewModeOverride` to the running view. */
  private applyViewModeOverride(): void {
    const before = this.viewMode;
    if (this.viewModeOverride === 'panel' && this.viewMode === 'page') {
      this.viewMode = 'panel';
      this.videoSequencer.reset();
    } else {
      this.updateCanvasAvailability();
    }
    if (this.viewMode === before) {
      return;
    }
    if (this.viewMode === 'canvas') {
      this.jumpCameraToCurrentPanel();
    }
    if (this.autoplayEnabled) {
      this.startAutoplay();
    }
  }

  /**
   * Cleanup on destroy
   */
  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
    }
    this.reducedMotionQuery?.removeEventListener('change', this.onReducedMotionQueryChange);
    this.endAnalyticsSession();
    this.stopAutoplay();
    this.stopAutoplayProgress();
    this.videoSequencer.reset();
    this.panelAudio.stopAll();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Follow both reduced-motion sources that can change at runtime: the OS
   * media query and the reader's Settings preference.
   */
  private watchReducedMotion(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.osReducedMotion = this.reducedMotionQuery.matches;
      this.reducedMotionQuery.addEventListener('change', this.onReducedMotionQueryChange);
    }
    this.playerState.preferences$?.pipe(takeUntil(this.destroy$)).subscribe((prefs) => {
      const next = !!prefs.reducedMotion;
      if (next !== this.prefReducedMotion) {
        this.prefReducedMotion = next;
        this.cdr.markForCheck();
      }
    });
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

      // Register the manifest's variable definitions: initializes defaults
      // and arms type validation + the read-only guard for every later
      // set()/mutation.
      this.variableDefinitions = this.extractVariableDefinitions();
      this.variableStore.setDefinitions(this.variableDefinitions);

      // Host-supplied initial values (privileged: may seed read-only vars).
      if (this.initialVariables) {
        this.variableStore.seed(this.initialVariables);
      }

      // Arm the paywall: rules come from the manifest, the snapshot from the
      // host (or from entitlementEndpoint). A work with no paywall.rules is
      // unaffected — PaywallService reports every panel accessible.
      await this.configurePaywall();

      // Initialize entitlement context. Seeded (not set()) so entitlement
      // facts can populate read-only variables; applied after
      // initialVariables so the adapter's values win on collisions.
      if (this.entitlementAdapter) {
        const context = await this.entitlementAdapter.getContext();
        this.variableStore.seed(context);
      }

      // Set initial locale and configure translations
      this.applyLocale();

      // Check if page view is available
      const loadedManifest = this.manifestService.getManifest();
      if (loadedManifest?.chapters) {
        const chapters = Object.values(loadedManifest.chapters);
        this.pageViewAvailable = chapters.some(chapter =>
          chapter.pages && chapter.pages.length > 0
        );
      }

      // Initial speech / audio / SFX toggle state: the reader's stored
      // preference wins, else the work's settings.ui.*Default (default: on).
      this.initializeAudioPreferences(loadedManifest ?? null);

      // Configure tracking (consent requirements + event whitelist) from the
      // manifest so video events flow through the consent/whitelist pipeline.
      this.configureTracking(loadedManifest);

      // Flatten the manifest's keyed extras blocks for the extras viewer
      // (also the target of hotspot openExtras actions).
      this.buildExtrasList(loadedManifest ?? null);

      // Like / bookmark state for this work, from the device.
      this.restoreSocialState();

      // Navigate to initial position. Without an explicit host position, a
      // bookmark the reader left in this work is resumed.
      const bookmark = !this.initialChapterId && !this.initialPanelId ? this.readBookmark() : null;
      if (this.initialChapterId && this.initialPanelId) {
        await this.navigateToPanel(this.initialChapterId, this.initialPanelId);
      } else if (this.initialChapterId) {
        await this.navigateToChapter(this.initialChapterId);
      } else if (bookmark && this.manifestService.getChapter(bookmark.chapterId)?.panels?.[bookmark.panelId]) {
        await this.navigateToPanel(bookmark.chapterId, bookmark.panelId);
      } else {
        await this.navigateToStart();
      }

      // Subscribe to state changes
      this.subscribeToStateChanges();

      // The host's `autoplay` input decides at start; the reader's toolbar
      // toggle takes over afterwards.
      if (this.autoplay && !this.autoplayEnabled) {
        this.onToggleAutoplay();
      }

      this.loading = false;
      this.ready.emit();
    } catch (err) {
      this.handleError(err as Error);
    }
    // Async completion (e.g. a reload from ngOnChanges): repaint the OnPush view.
    this.cdr.markForCheck();
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
    await this.manifestService.loadManifestFromUrl(url).toPromise();
  }

  /**
   * Subscribe to state changes
   */
  private subscribeToStateChanges(): void {
    if (this.stateSubscribed) {
      return;
    }
    this.stateSubscribed = true;
    // Listen to panel changes
    this.playerState.currentPanel$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panel) => {
        if (panel && this.currentChapter) {
          this.currentPanel = panel;
          // Resolve variants before emitting so consumers (and the
          // tracked event) see the effective panel state.
          this.refreshResolvedPanels();
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
          this.refreshVariableContext();
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
   * @param mutations - Variable mutations of the traversed edge. Applied only
   *   once the navigation is allowed (after the paywall / age gate), so a
   *   blocked attempt never changes story state.
   */
  async navigateToPanel(
    chapterId: string,
    panelId: string,
    transition?: Transition,
    cameraMove?: CameraMove,
    mutations?: Mutation[]
  ): Promise<void> {
    try {
      this.viewportTransition = transition ?? null;
      // Check entitlement. A host-supplied adapter still wins — it is the
      // documented override — but a refusal now raises the paywall instead of
      // throwing a navigation error at the reader.
      if (this.entitlementAdapter) {
        const hasAccess = await this.entitlementAdapter.hasAccess(panelId);
        if (!hasAccess) {
          this.openPaywall(this.paywallService.gateFor(panelId) ?? {
            scope: 'panel',
            refId: panelId,
            reason: PaywallService.readerMessage(null),
            lockReason: 'entitlement_required',
          });
          return;
        }
      } else if (!this.paywallService.canAccess(panelId)) {
        // Manifest paywall rules (schema `paywall.rules`) evaluated against
        // what the reader owns. Navigation stops here: the reader stays on
        // the last panel they were entitled to see.
        if (this.paywallService.evaluate(panelId).reason === 'age_verification_required') {
          // An age gate is answered in-player (birth date), not by checkout.
          this.openAgeGate(chapterId, panelId, transition, cameraMove, mutations);
          return;
        }
        const gate = this.paywallService.gateFor(panelId);
        if (gate) {
          this.openPaywall(gate);
          return;
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

      // Edge `action` mutations (schema: "applied when traversing this edge").
      if (mutations?.length) {
        this.variableStore.applyMutations(mutations, { chapterId });
      }

      const chapterChanged = this.currentChapter !== chapter;
      const leavingPanelId = this.getCurrentPanelId();
      this.currentChapter = chapter;
      this.currentPanel = panelData.panel;
      this.playerState.setCurrentPanel(panelData.panel);
      this.refreshVariableContext();

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
      // No panelChange.emit here: setCurrentPanel() above already emitted it
      // through the currentPanel$ subscription (with variants resolved) —
      // emitting again handed every host each panel change twice.
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  /**
   * Rebuild the flat variable context handed to the viewport/canvas for
   * hotspot visibleIf evaluation. New object identity per call so OnPush
   * children re-evaluate.
   */
  private refreshVariableContext(): void {
    this.variableContext = this.variableStore.createContext(this.currentChapter?.id);
    this.refreshResolvedPanels();
  }

  /**
   * Re-resolve panel variants against the current variable context.
   * Called whenever variables change or the current panel/chapter moves,
   * so variant-driven content reacts immediately (spec: "Re-evaluate
   * variants" after every mutation).
   */
  private refreshResolvedPanels(): void {
    const panels = this.currentChapter?.panels ?? {};
    this.resolvedPanels = resolvePanels(panels, this.variableContext);

    if (!this.currentPanel) {
      this.effectivePanel = undefined;
      this.activeVariantId = undefined;
      this.syncPanelAudio();
      return;
    }

    const panelId = this.getCurrentPanelId();
    const forced = panelId !== undefined ? this.variantOverrides.get(panelId) : undefined;
    const resolved = resolvePanelVariant(this.currentPanel, this.variableContext, forced);
    this.effectivePanel = resolved.panel;
    this.activeVariantId = resolved.variantId;

    // A manual override on the current panel must also win in the
    // page/canvas panel record.
    if (panelId && this.resolvedPanels[panelId] !== resolved.panel) {
      this.resolvedPanels = { ...this.resolvedPanels, [panelId]: resolved.panel };
    }

    this.syncPanelAudio();
  }

  /**
   * Keep the audio engine's playing set in step with the effective panel
   * (variant-resolved, so a variant's `audio` override wins) and the
   * variable context its tracks' `visibleIf` conditions read.
   */
  private syncPanelAudio(): void {
    this.panelAudio.syncPanel(
      this.getCurrentPanelId(),
      this.effectivePanel ?? this.currentPanel,
      this.variableContext
    );
  }

  /**
   * Hotspot activated in the viewport (click or keyboard): execute its
   * action, apply the returned UI effect, refresh the variable context so
   * visibleIf-dependent hotspots/variants update.
   */
  onHotspotActivate(evt: { hotspot: Hotspot; x: number; y: number; panelId: string | null }): void {
    this.trackHotspotClick(evt.panelId, evt.x, evt.y, evt.hotspot.id);
    const effect = this.hotspotAction.execute(evt.hotspot.action, {
      chapterId: this.currentChapter?.id,
    });
    this.applyHotspotEffect(effect);
    this.refreshVariableContext();
  }

  private applyHotspotEffect(effect: HotspotUiEffect): void {
    switch (effect.kind) {
      case 'navigate':
        if (this.currentChapter) {
          void this.navigateToPanel(this.currentChapter.id, effect.to, effect.transition);
        }
        break;
      case 'openExtras':
        this.extrasInitialId = effect.extrasId;
        this.extrasVisible = true;
        break;
      case 'openModal':
        this.actionModalTitle = effect.title;
        this.actionModalContent = effect.content;
        this.actionModalVisible = true;
        break;
      case 'none':
        break;
    }
  }

  /**
   * Click on panel content that hit no hotspot
   */
  onDeadClick(evt: { x: number; y: number; panelId: string | null }): void {
    this.trackHotspotClick(evt.panelId, evt.x, evt.y);
  }

  /**
   * Track a hotspot_click event. Dead clicks (no hotspotId) reuse the same
   * event type with hit=false — the payload contract the CMS heatmap
   * endpoint queries: { panelId, chapterId, hotspotId?, x, y, hit }.
   */
  private trackHotspotClick(panelId: string | null, x: number, y: number, hotspotId?: string): void {
    this.trackingService.track('hotspot_click', {
      panelId: panelId ?? this.getCurrentPanelId() ?? undefined,
      chapterId: this.currentChapter?.id,
      hotspotId,
      x: Math.round(x * 10000) / 10000,
      y: Math.round(y * 10000) / 10000,
      hit: !!hotspotId,
    });
  }

  /**
   * Flatten the manifest's keyed Extras structure (cover/bonus_art/...) into
   * the viewer's flat list. Asset/thumbnail resolution is a pre-existing
   * viewer gap and stays out of scope here.
   */
  private buildExtrasList(manifest: PanelWaveManifest | null): void {
    // Media (images / video / audio / thumbnails) resolve through the asset
    // catalog; see utils/extras-utils.ts for the ExtraBlock mapping.
    // An extras-scoped paywall rule the reader does not satisfy locks its block.
    this.extrasList = extrasFromManifest(
      manifest?.extras as Record<string, unknown> | undefined,
      (assetId) => this.manifestService.getAsset(assetId) as CatalogLike | null
    ).map((extra) => (this.paywallService.isExtraLocked(extra.id) ? { ...extra, gated: true } : extra));
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
    if (this.motionReduced) {
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
          result.cameraMove,
          result.action
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

    // Auto-hide after 5 seconds. The timeout runs outside any template
    // event, so OnPush needs an explicit markForCheck to repaint.
    setTimeout(() => {
      if (this.toolbarVisible) {
        this.toolbarVisible = false;
        this.cdr.markForCheck();
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
    // Conditional content (visibleIf, variants) reacts immediately.
    this.refreshVariableContext();
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
      this.jumpCameraToCurrentPanel();
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

  /** Land the canvas camera on the current panel (entering canvas view). */
  private jumpCameraToCurrentPanel(): void {
    const panelId = this.getCurrentPanelId();
    const placement = panelId ? this.currentChapter?.canvas?.placements?.[panelId] : undefined;
    if (placement) {
      this.canvasCamera.jumpTo(this.canvasCamera.frameForPlacement(placement));
    }
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
          this.flowEngine.getDefaultCameraMove(this.manifestService.getManifest()?.settings),
        edge.action
      );
      return;
    }
    if (this.visitedPanelIds.includes(panelId)) {
      this.navigationAttempt.emit({ direction: 'panel', target: panelId });
      void this.navigateToPanel(this.currentChapter.id, panelId);
    }
  }

  /**
   * The manifest actually loaded — from `manifest` or fetched via
   * `manifestUrl`. Everything that lists the work (ToC, thumbnails) binds to
   * this, never to the `manifest` input, which is unset for URL loading.
   */
  get loadedManifest(): PanelWaveManifest | undefined {
    return this.manifestService.getManifest() ?? undefined;
  }

  /** Balloon defaults for the canvas stage (same source as the viewport). */
  get manifestBalloonConfig(): BalloonConfig | null {
    return this.manifestService.getManifest()?.settings?.typography?.balloon_config ?? null;
  }

  /** Manifest characters for speech-bubble styling in canvas view. */
  get manifestCharacters(): ManifestCharacter[] {
    return this.manifestService.getManifest()?.meta?.characters ?? [];
  }

  /** Manifest preload settings for the canvas stage's neighbor warming. */
  get manifestPreloadSettings() {
    return this.manifestService.getManifest()?.settings?.preload ?? null;
  }

  onLocaleChange(locale: LocaleCode): void {
    // Content locale and GUI language stay in sync.
    this.locale = locale;
    this.applyLocale();
  }

  onToggleSpeech(): void {
    this.setSpeechEnabled(!this.speechEnabled);
  }

  onToggleAudio(): void {
    this.setAudioEnabled(!this.audioEnabled);
  }

  onToggleSfx(): void {
    this.setSfxEnabled(!this.sfxEnabled);
  }

  /**
   * Speech bubbles on/off. Also gates the voiceover bus: spoken lines belong
   * to the bubbles they voice (schema audio roles).
   */
  setSpeechEnabled(enabled: boolean): void {
    if (this.speechEnabled === enabled) {
      return;
    }
    this.speechEnabled = enabled;
    this.playerState.updatePreference('speech', enabled);
    this.applyAudioPreferences();
    this.trackingService.track('speech_toggle', { enabled });
  }

  /**
   * Master audio on/off: every engine bus and video sound.
   */
  setAudioEnabled(enabled: boolean): void {
    if (this.audioEnabled === enabled) {
      return;
    }
    this.audioEnabled = enabled;
    this.playerState.updatePreference('audio', enabled);
    this.applyAudioPreferences();
    this.trackingService.track('audio_toggle', { enabled });
  }

  /**
   * Sound effects on/off (sfx bus incl. `ui` sounds).
   */
  setSfxEnabled(enabled: boolean): void {
    if (this.sfxEnabled === enabled) {
      return;
    }
    this.sfxEnabled = enabled;
    this.playerState.updatePreference('sfx', enabled);
    this.applyAudioPreferences();
    this.trackingService.track('sfx_toggle', { enabled });
  }

  /**
   * Seed the toggle states once the manifest is loaded: a preference the
   * reader set explicitly (this or an earlier session) wins over the work's
   * `settings.ui.speechDefault` / `audioDefault` / `sfxDefault`.
   */
  private initializeAudioPreferences(manifest: PanelWaveManifest | null): void {
    const ui = manifest?.settings?.ui;
    const prefs = this.playerState.getPreferences();
    const pick = (key: 'speech' | 'audio' | 'sfx', workDefault: boolean | undefined): boolean =>
      this.playerState.hasPersistedPreference(key) ? prefs[key] : workDefault !== false;

    this.speechEnabled = pick('speech', ui?.speechDefault);
    this.audioEnabled = pick('audio', ui?.audioDefault);
    this.sfxEnabled = pick('sfx', ui?.sfxDefault);
    this.applyAudioPreferences();
  }

  /**
   * Push the toggle states and stored volumes into the mixer. Mutes and
   * volumes are independent in the engine, so toggling never loses a level.
   */
  private applyAudioPreferences(): void {
    const prefs = this.playerState.getPreferences();
    this.audioEngine.setMasterVolume(prefs.masterVolume ?? 1);
    this.audioEngine.setRoleVolume('sfx', prefs.sfxVolume ?? 1);
    this.audioEngine.setMasterMuted(!this.audioEnabled);
    this.audioEngine.setRoleMuted('sfx', !this.sfxEnabled);
    this.audioEngine.setRoleMuted('voiceover', !this.speechEnabled);
  }

  /**
   * Settings modal "Save" (Preferences tab). Toggle-backed preferences go
   * through the same setters as the toolbar; the rest are persisted for the
   * host/state to read (manga mode, reduced motion and high contrast have
   * no shell behaviour yet).
   */
  onPreferencesChange(prefs: Preferences): void {
    this.setSpeechEnabled(prefs.speech);
    this.setAudioEnabled(prefs.audio);
    this.setSfxEnabled(prefs.sfx);

    const seconds = Number(prefs.secondsPerPanel);
    if (Number.isFinite(seconds) && seconds > 0 && seconds !== this.secondsPerPanel) {
      this.onSecondsPerPanelChange(seconds);
    }
    if (prefs.autoplay !== this.autoplayEnabled) {
      this.onToggleAutoplay();
    }

    this.playerState.updatePreferences({
      autoplay: prefs.autoplay,
      secondsPerPanel: this.secondsPerPanel,
      mangaMode: prefs.mangaMode,
      reducedMotion: prefs.reducedMotion,
      highContrast: prefs.highContrast,
    });
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
    // Fresh snapshot of the current values for the modal's local copy.
    const values: Record<string, unknown> = {};
    for (const def of this.variableDefinitions) {
      values[def.id] = this.variableStore.get(def.id, def.scope, this.scopeIdFor(def));
    }
    this.settingsVariableValues = values;

    // Preferences tab: toggle-backed values from the shell, the rest from
    // the persisted state.
    const prefs = this.playerState.getPreferences();
    this.settingsPreferences = {
      speech: this.speechEnabled,
      audio: this.audioEnabled,
      sfx: this.sfxEnabled,
      autoplay: this.autoplayEnabled,
      secondsPerPanel: this.secondsPerPanel,
      mangaMode: prefs.mangaMode,
      reducedMotion: prefs.reducedMotion,
      highContrast: prefs.highContrast,
    };
    this.settingsVisible = true;
  }

  /**
   * A settings-modal variable edit (emitted per changed key on save).
   * Routed through set(), so read-only definitions stay untouchable and
   * types are validated; conditional content re-resolves immediately.
   */
  onSettingsVariableChange(change: { key: string; value: unknown }): void {
    const def = this.variableDefinitions.find((d) => d.id === change.key);
    this.variableStore.set(
      change.key,
      change.value,
      def?.scope ?? 'session',
      def ? this.scopeIdFor(def) : undefined
    );
    this.refreshVariableContext();
    this.variableChange.emit({ key: change.key, value: change.value });
  }

  /** Scope id for chapter-/page-scoped variable definitions. */
  private scopeIdFor(def: VariableDefinition): string | undefined {
    if (def.scope === 'chapter') return this.currentChapter?.id;
    if (def.scope === 'page') return this.currentPage?.id;
    return undefined;
  }

  /**
   * Normalize the manifest's `variables` block into a definitions array.
   * The schema shape is { definitions: VariableDefinition[] }; a legacy
   * map keyed by variable id is tolerated as well.
   */
  private extractVariableDefinitions(): VariableDefinition[] {
    const variables = this.manifestService.getManifest()?.variables as
      | { definitions?: VariableDefinition[] }
      | Record<string, VariableDefinition>
      | undefined;
    if (!variables || typeof variables !== 'object') {
      return [];
    }
    const definitions = (variables as { definitions?: VariableDefinition[] }).definitions;
    if (Array.isArray(definitions)) {
      return definitions.filter((d) => !!d && typeof d.id === 'string');
    }
    // Legacy map form: { "<id>": definition }
    return Object.values(variables).filter(
      (d): d is VariableDefinition => !!d && typeof d === 'object' && typeof d.id === 'string'
    );
  }

  onOpenCharacters(): void {
    this.charactersVisible = true;
  }

  /**
   * Cycle the manual variant selection of the current panel:
   * automatic (conditions) → each variant in order → base panel →
   * back to automatic. The selection is a session-scoped shadow
   * override; navigation keeps it per panel.
   */
  onCycleAlternative(): void {
    const panelId = this.getCurrentPanelId();
    const variants = this.currentPanel?.variants;
    if (!panelId || !variants?.length) {
      return;
    }

    const current = this.variantOverrides.has(panelId)
      ? this.variantOverrides.get(panelId)
      : undefined;

    let next: string | null | undefined;
    if (current === undefined) {
      next = variants[0].id;
    } else if (current === null) {
      next = undefined; // base → back to automatic
    } else {
      const index = variants.findIndex((v) => v.id === current);
      next = index >= 0 && index < variants.length - 1 ? variants[index + 1].id : null;
    }

    if (next === undefined) {
      this.variantOverrides.delete(panelId);
    } else {
      this.variantOverrides.set(panelId, next);
    }
    this.refreshResolvedPanels();
  }

  /** Open the branch chooser with the paths currently open from this panel. */
  onShowBranches(): void {
    this.branchChoices = this.computeBranchChoices();
    if (this.branchChoices.length === 0) {
      return;
    }
    this.branchChooserVisible = true;
    this.cdr.markForCheck();
  }

  onOpenExtras(): void {
    this.extrasVisible = true;
  }

  /** Toggle the reader's like for this work (persisted on the device). */
  onLike(): void {
    this.liked = !this.liked;
    const store = this.readSocialStore();
    const entry = store[this.workKey()] ?? {};
    entry.liked = this.liked;
    store[this.workKey()] = entry;
    this.writeSocialStore(store);

    this.trackingService.track('like', { workId: this.workKey(), liked: this.liked });
    this.likeChange.emit({ workId: this.workKey(), liked: this.liked });
    this.cdr.markForCheck();
  }

  /**
   * Toggle the bookmark on the current panel: set it here, or clear it when
   * this panel already is the bookmark. Resumed on the next load when the
   * host passes no initial position.
   */
  onBookmark(): void {
    const chapterId = this.currentChapter?.id;
    const panelId = this.getCurrentPanelId();
    if (!chapterId || !panelId) {
      return;
    }

    const store = this.readSocialStore();
    const entry = store[this.workKey()] ?? {};
    const isSamePanel = entry.bookmark?.chapterId === chapterId && entry.bookmark?.panelId === panelId;
    if (isSamePanel) {
      delete entry.bookmark;
      this.bookmarked = false;
    } else {
      entry.bookmark = { chapterId, panelId, savedAt: Date.now() };
      this.bookmarked = true;
    }
    store[this.workKey()] = entry;
    this.writeSocialStore(store);

    this.trackingService.track('bookmark', { workId: this.workKey(), chapterId, panelId, bookmarked: this.bookmarked });
    this.bookmarkChange.emit({ workId: this.workKey(), chapterId, panelId, bookmarked: this.bookmarked });
    this.cdr.markForCheck();
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
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    // The paywall and the age gate block the story: no shortcut may move
    // past them. Their own Escape handling applies (paywall: "Maybe later"
    // dismisses; age gate: dismiss keeps the reader where they were).
    if (this.paywallVisible || this.ageGateVisible) {
      return;
    }

    // While a dialog is open the story behind it must not react: Escape
    // closes the dialog (not the toolbar), every other shortcut is ignored.
    if (this.closableDialogOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeTopDialog();
      }
      return;
    }
    // A dialog that handled Escape itself has already closed by now; the
    // key press was meant for it, not for hiding the toolbar.
    if (event.key === 'Escape' && this.cameFromDialog(event)) {
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
          void this.canvasCamera.toggleOverview(!(this.motionReduced));
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

  /** Dialogs the reader can dismiss with Escape (paywall/age gate excluded). */
  private closableDialogOpen(): boolean {
    return this.actionModalVisible || this.branchChooserVisible || this.shareVisible
      || this.commentsVisible || this.extrasVisible || this.charactersVisible
      || this.languageModalVisible || this.settingsVisible || this.tocVisible;
  }

  /** Close the most recently layered dialog (nested ones first). */
  private closeTopDialog(): void {
    if (this.actionModalVisible) { this.actionModalVisible = false; return; }
    if (this.branchChooserVisible) { this.branchChooserVisible = false; return; }
    if (this.shareVisible) { this.shareVisible = false; return; }
    if (this.commentsVisible) { this.commentsVisible = false; return; }
    if (this.extrasVisible) { this.extrasVisible = false; return; }
    if (this.charactersVisible) { this.charactersVisible = false; return; }
    if (this.languageModalVisible) { this.languageModalVisible = false; return; }
    if (this.settingsVisible) { this.settingsVisible = false; return; }
    if (this.tocVisible) { this.tocVisible = false; }
  }

  private static readonly DIALOG_HOSTS = new Set([
    'PW-ACTION-MODAL', 'PW-BRANCH-CHOOSER', 'PW-CHARACTER-ROSTER', 'PW-COMMENTS-DRAWER',
    'PW-EXTRAS-VIEWER', 'PW-LANGUAGE-MODAL', 'PW-SETTINGS-MODAL', 'PW-SHARE-MODAL',
    'PW-TOC-OVERLAY', 'PW-AGE-GATE', 'PW-PAYWALL-OVERLAY', 'PW-CONTENT-WARNING-OVERLAY',
  ]);

  private cameFromDialog(event: KeyboardEvent): boolean {
    return event.composedPath().some(
      (node) => node instanceof Element && PlayerShellComponent.DIALOG_HOSTS.has(node.tagName)
    );
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
    if (this.paywallVisible || this.ageGateVisible) {
      return;
    }
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
      const videoIds = this.onViewVideoLayerIds(this.effectivePanel ?? this.currentPanel);
      if (videoIds.length > 0) {
        // Media-event driven: wait for every on-view video's pass (the
        // longest pass wins). Progress display uses durationMs as estimate.
        this.pendingVideoPasses = new Set(videoIds);
        this.autoplayDuration =
          (this.effectivePanel ?? this.currentPanel)?.durationMs ?? this.secondsPerPanel * 1000;
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
    const durationMs = (this.effectivePanel ?? this.currentPanel)?.durationMs ?? (this.secondsPerPanel * 1000);

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
    const layer = (this.effectivePanel ?? this.currentPanel)?.layers?.find((l) => l.id === videoId);
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
    const reduced = this.motionReduced;
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
      this.refreshResolvedPanels();
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
      this.refreshResolvedPanels();
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

  // ── Paywall ───────────────────────────────────────────────────────────────

  /**
   * Load the manifest's paywall rules and the reader's entitlement snapshot.
   *
   * Precedence: an explicit `entitlementSnapshot` wins over
   * `entitlementEndpoint`, so a host that already knows what the reader owns
   * never pays for a round-trip.
   */
  private async configurePaywall(): Promise<void> {
    try {
      await this.loadEntitlementSnapshot();
    } finally {
      // A verification the reader already passed on this device tops up
      // whatever snapshot the host provided.
      this.restoreAgeVerification();
    }
  }

  private async loadEntitlementSnapshot(): Promise<void> {
    const manifest = this.manifestService.getManifest();
    this.paywallService.setManifest(manifest);

    if (this.entitlementSnapshot) {
      this.paywallService.setSnapshot(this.entitlementSnapshot);
      return;
    }

    if (this.entitlementEndpoint && manifest) {
      this.httpEntitlement = new HttpEntitlementAdapter({
        endpoint: this.entitlementEndpoint,
        readerToken: this.readerToken,
      });
      this.httpEntitlement.setManifest(manifest);
      try {
        // resolveEntitlement() populates the cached snapshot as a side effect;
        // the work-level call is the cheapest way to prime it.
        await this.httpEntitlement.resolveEntitlement({ workId: manifest.meta?.id ?? '' });
        this.paywallService.setSnapshot(this.httpEntitlement.getSnapshot());
      } catch {
        // Leave the anonymous snapshot in place: on a backend failure the
        // reader sees the free preview and the gate, never the paid content.
      }
    }
  }

  /** Raise the paywall overlay for a gate. */
  private openPaywall(gate: PaywallGate): void {
    this.paywallGate = gate;
    this.paywallVisible = true;
  }

  /** Dismiss the overlay without changing entitlement. */
  closePaywall(): void {
    this.paywallVisible = false;
    this.paywallGate = null;
  }

  /**
   * A reader acted on the overlay. Checkout belongs to the host — the player
   * never talks to a payment provider — so the action is emitted and the
   * overlay closes for anything other than a dismiss.
   */
  onPaywallAction(action: PaywallAction): void {
    const gate = this.paywallGate;
    const productId = action === 'purchase' || action === 'subscribe' ? this.paywallProductId : undefined;
    if (gate) {
      this.paywallAction.emit({ action, gate, ...(productId ? { productId } : {}) });
    }
    this.paywallProductId = undefined;
    this.closePaywall();
  }

  /**
   * Re-check entitlements after the host reports a completed purchase, then
   * drop the overlay if the reader is now through the gate.
   */
  async refreshEntitlements(snapshot?: EntitlementSnapshot): Promise<void> {
    if (snapshot) {
      this.paywallService.setSnapshot(snapshot);
    } else if (this.httpEntitlement) {
      this.httpEntitlement.invalidate();
      const manifest = this.manifestService.getManifest();
      await this.httpEntitlement.resolveEntitlement({ workId: manifest?.meta?.id ?? '' });
      this.paywallService.setSnapshot(this.httpEntitlement.getSnapshot());
    }
    // What the host passed replaces the snapshot wholesale; an age check the
    // reader already passed on this device still counts.
    this.restoreAgeVerification();
    this.buildExtrasList(this.manifestService.getManifest() ?? null);

    const gatedPanelId = this.paywallGate?.refId ?? this.getCurrentPanelId();
    if (gatedPanelId && this.paywallService.canAccess(gatedPanelId)) {
      this.closePaywall();
    }
  }

  // ── Age gate ──────────────────────────────────────────────────────────────

  private static readonly AGE_VERIFIED_STORAGE_KEY = 'pw-age-verified';

  /** Raise the age gate for a panel and remember where the reader was going. */
  private openAgeGate(
    chapterId: string,
    panelId: string,
    transition?: Transition,
    cameraMove?: CameraMove,
    mutations?: Mutation[]
  ): void {
    this.ageGateMinimumAge = this.paywallService.ruleFor(panelId)?.minimumAge ?? 18;
    this.pendingAgeGatedNavigation = { chapterId, panelId, transition, cameraMove, mutations };
    this.ageGateVisible = true;
    this.cdr.markForCheck();
  }

  /** Dismissed without verifying: the reader stays where they were. */
  closeAgeGate(): void {
    this.ageGateVisible = false;
    this.pendingAgeGatedNavigation = null;
    this.cdr.markForCheck();
  }

  /**
   * The reader answered the gate. A pass is persisted on the device and
   * folded into the entitlement snapshot, then the interrupted navigation
   * resumes; a fail keeps the overlay (it shows its own message).
   */
  async onAgeGateVerify(result: AgeVerificationResult): Promise<void> {
    this.ageVerified.emit(result);
    if (!result.verified || result.age === undefined) {
      return;
    }

    this.persistAgeVerification(result.age);
    this.paywallService.setSnapshot({
      ...this.paywallService.getSnapshot(),
      ageVerified: true,
      age: result.age,
    });

    const pending = this.pendingAgeGatedNavigation;
    this.ageGateVisible = false;
    this.pendingAgeGatedNavigation = null;
    this.cdr.markForCheck();

    if (pending && this.paywallService.canAccess(pending.panelId)) {
      await this.navigateToPanel(
        pending.chapterId,
        pending.panelId,
        pending.transition,
        pending.cameraMove,
        pending.mutations
      );
    }
  }

  private persistAgeVerification(age: number): void {
    try {
      localStorage.setItem(
        PlayerShellComponent.AGE_VERIFIED_STORAGE_KEY,
        JSON.stringify({ age, verifiedAt: Date.now() })
      );
    } catch {
      // Storage unavailable (private mode, quota): the gate simply asks again next time.
    }
  }

  private restoreAgeVerification(): void {
    if (this.paywallService.getSnapshot().ageVerified) {
      return;
    }
    try {
      const raw = localStorage.getItem(PlayerShellComponent.AGE_VERIFIED_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const stored = JSON.parse(raw) as { age?: number };
      if (typeof stored.age !== 'number') {
        return;
      }
      this.paywallService.setSnapshot({
        ...this.paywallService.getSnapshot(),
        ageVerified: true,
        age: stored.age,
      });
    } catch {
      // Unreadable storage: treat as not verified.
    }
  }

  // ── Like / bookmark (device-local social state) ──────────────────────────

  private static readonly SOCIAL_STORAGE_KEY = 'pw-social';

  /** Key that identifies this work in device storage. */
  private workKey(): string {
    return this.manifestService.getManifest()?.meta?.id ?? this.manifestUrl ?? 'work';
  }

  private readSocialStore(): Record<string, SocialEntry> {
    try {
      const raw = localStorage.getItem(PlayerShellComponent.SOCIAL_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, SocialEntry>) : {};
    } catch {
      return {};
    }
  }

  private writeSocialStore(store: Record<string, SocialEntry>): void {
    try {
      localStorage.setItem(PlayerShellComponent.SOCIAL_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Storage unavailable: the toggle still works for this session.
    }
  }

  private readBookmark(): SocialEntry['bookmark'] | null {
    return this.readSocialStore()[this.workKey()]?.bookmark ?? null;
  }

  /** Load the like flag; the bookmark flag follows the current panel. */
  private restoreSocialState(): void {
    const entry = this.readSocialStore()[this.workKey()];
    this.liked = entry?.liked === true;
    this.syncBookmarkFlag();
  }

  /** `bookmarked` is true only while the reader is ON the bookmarked panel. */
  private syncBookmarkFlag(): void {
    const bookmark = this.readBookmark();
    this.bookmarked =
      !!bookmark &&
      bookmark.chapterId === this.currentChapter?.id &&
      bookmark.panelId === this.getCurrentPanelId();
  }

  // ── Branch choices ────────────────────────────────────────────────────────

  /**
   * At least two paths out of the current panel are open right now (edge
   * conditions evaluated exactly like the chooser does) — the toolbar shows
   * "Choices". A closed conditional edge does not count.
   */
  get hasBranchesAhead(): boolean {
    return this.openEdges().length > 1;
  }

  /** Outgoing edges of the current panel whose conditions pass right now. */
  private openEdges(): Edge[] {
    const chapter = this.currentChapter;
    const panelId = this.getCurrentPanelId();
    if (!chapter || !panelId) {
      return [];
    }
    const outgoing = chapter.graph?.edges?.filter((edge) => edge.from === panelId) ?? [];
    if (!outgoing.some((edge) => edge.condition)) {
      // Nothing to evaluate: skip building a variable context on every check.
      return outgoing;
    }
    const context = this.variableStore.createContext(chapter.id);
    return outgoing.filter((edge) => !edge.condition || evaluateJsonLogic(edge.condition, context));
  }

  /** Open outgoing edges with reader-facing labels. */
  private computeBranchChoices(): BranchChoice[] {
    const chapter = this.currentChapter;
    return chapter
      ? this.openEdges().map((edge, index) => ({ edge, index, label: this.branchLabel(edge, chapter) }))
      : [];
  }

  private branchLabel(edge: { label?: Record<string, string>; to: string }, chapter: Chapter): string {
    const fromEdge = this.localizedText(edge.label);
    if (fromEdge) {
      return fromEdge;
    }
    // Neither: the chooser renders a translated "Option N".
    return this.localizedText(chapter.panels?.[edge.to]?.title);
  }

  private localizedText(value: LocalizedString | Record<string, string> | undefined): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    return value[this.locale] ?? value['en-US'] ?? Object.values(value)[0] ?? '';
  }

  /** Traverse the chosen edge (its transition / camera move / mutations apply). */
  async onBranchChosen(choice: BranchChoice): Promise<void> {
    this.branchChooserVisible = false;
    const chapter = this.currentChapter;
    if (!chapter) {
      return;
    }
    const settings = this.manifestService.getManifest()?.settings;
    this.trackingService.track('branch_choice', {
      chapterId: chapter.id,
      from: choice.edge.from,
      to: choice.edge.to,
      index: choice.index,
    });
    await this.navigateToPanel(
      chapter.id,
      choice.edge.to,
      choice.edge.transition ?? this.flowEngine.getDefaultTransition(settings),
      choice.edge.cameraMove ?? this.flowEngine.getDefaultCameraMove(settings),
      choice.edge.action
    );
  }
}

/** Per-work like / bookmark record kept in device storage. */
interface SocialEntry {
  liked?: boolean;
  bookmark?: { chapterId: string; panelId: string; savedAt: number };
}
