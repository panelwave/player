/**
 * Player State Service
 * Central state management for the PanelWave Player using RxJS
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, distinctUntilChanged, filter, map } from 'rxjs';
import { PlayerEvent } from '../types';
import type {
  PanelWaveManifest,
  PlayerState,
  PlayerPreferences,
  OverlayState,
  ViewportState,
  ViewMode,
  LocaleCode,
  PaywallGate,
  PreloadStatus,
  PlayerError,
  PlayerEventData,
} from '../types';

/**
 * Initial player state
 */
const createInitialState = (): PlayerState => ({
  manifest: null,
  manifestLoaded: false,
  manifestError: null,
  currentWorkId: null,
  currentChapterId: null,
  currentPageId: null,
  currentPanelId: null,
  navigationHistory: [],
  viewMode: 'panel',
  viewport: {
    panX: 0,
    panY: 0,
    zoom: 1,
    width: 0,
    height: 0,
    hasOverflowLeft: false,
    hasOverflowRight: false,
    hasOverflowTop: false,
    hasOverflowBottom: false,
  },
  locale: 'en-US',
  preferences: {
    speech: true,
    audio: true,
    sfx: true,
    autoplay: false,
    secondsPerPanel: 5,
    mangaMode: false,
    reducedMotion: false,
    highContrast: false,
    masterVolume: 1,
    sfxVolume: 1,
  },
  variables: {
    global: {},
    chapter: {},
    page: {},
    session: {},
    persistent: {},
  },
  entitlements: {},
  paywallGate: null,
  overlays: {
    toolbar: false,
    thumbnails: false,
    toc: false,
    settings: false,
    characters: false,
    extras: false,
    comments: false,
    share: false,
    contentWarning: false,
    paywall: false,
  },
  trackingConsent: false,
  sessionId: generateSessionId(),
  preloadStatus: {
    queueSize: 0,
    inFlight: 0,
    completed: 0,
    total: 0,
  },
  loading: false,
  error: null,
});

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `pw-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Player State Service
 * Manages all runtime state for the player with reactive observables
 */
@Injectable({
  providedIn: 'root',
})
export class PlayerStateService {
  // Private state subject
  private readonly state$ = new BehaviorSubject<PlayerState>(createInitialState());

  // Private event bus
  private readonly events$ = new BehaviorSubject<PlayerEventData | null>(null);

  // Public state observable
  readonly state: Observable<PlayerState> = this.state$.asObservable();

  // Selectors - Observable streams for specific state slices
  readonly manifest$: Observable<PanelWaveManifest | null> = this.select((s) => s.manifest);
  readonly manifestLoaded$: Observable<boolean> = this.select((s) => s.manifestLoaded);
  readonly manifestError$: Observable<string | null> = this.select((s) => s.manifestError);

  readonly currentWorkId$: Observable<string | null> = this.select((s) => s.currentWorkId);
  readonly currentChapterId$: Observable<string | null> = this.select((s) => s.currentChapterId);
  readonly currentPageId$: Observable<string | null> = this.select((s) => s.currentPageId);
  readonly currentPanelId$: Observable<string | null> = this.select((s) => s.currentPanelId);

  readonly navigationHistory$: Observable<string[]> = this.select((s) => s.navigationHistory);
  readonly viewMode$: Observable<ViewMode> = this.select((s) => s.viewMode);
  readonly viewport$: Observable<ViewportState> = this.select((s) => s.viewport);

  readonly locale$: Observable<LocaleCode> = this.select((s) => s.locale);
  readonly preferences$: Observable<PlayerPreferences> = this.select((s) => s.preferences);

  readonly entitlements$: Observable<Record<string, boolean>> = this.select((s) => s.entitlements);
  readonly paywallGate$: Observable<PaywallGate | null> = this.select((s) => s.paywallGate);

  readonly overlays$: Observable<OverlayState> = this.select((s) => s.overlays);
  readonly trackingConsent$: Observable<boolean> = this.select((s) => s.trackingConsent);
  readonly sessionId$: Observable<string> = this.select((s) => s.sessionId);

  readonly preloadStatus$: Observable<PreloadStatus> = this.select((s) => s.preloadStatus);
  readonly loading$: Observable<boolean> = this.select((s) => s.loading);
  readonly error$: Observable<PlayerError | null> = this.select((s) => s.error);

  // Event stream (filtered to exclude null)
  readonly events: Observable<PlayerEventData> = this.events$.pipe(
    filter((event): event is PlayerEventData => event !== null),
    distinctUntilChanged()
  );

  constructor() {
    // Load persisted preferences from localStorage
    this.loadPersistedPreferences();
  }

  /**
   * Get current state snapshot (synchronous)
   */
  getState(): PlayerState {
    return this.state$.value;
  }

  /**
   * Create a selector for a specific state slice
   */
  private select<T>(selector: (state: PlayerState) => T): Observable<T> {
    return this.state$.pipe(map(selector), distinctUntilChanged());
  }

  /**
   * Update state immutably
   */
  private updateState(updater: (state: PlayerState) => Partial<PlayerState>): void {
    const currentState = this.state$.value;
    const updates = updater(currentState);
    const newState = { ...currentState, ...updates };
    this.state$.next(newState);
  }

  /**
   * Emit a player event
   */
  private emitEvent(type: PlayerEvent, payload?: unknown): void {
    const event: PlayerEventData = {
      type,
      payload,
      timestamp: Date.now(),
    };
    this.events$.next(event);
  }

  // ============================================================================
  // Actions - State mutation methods
  // ============================================================================

  /**
   * Set the manifest
   */
  setManifest(manifest: PanelWaveManifest): void {
    this.updateState(() => ({
      manifest,
      manifestLoaded: true,
      manifestError: null,
      currentWorkId: manifest.meta.id,
      locale: manifest.meta.default_locale,
    }));

    this.emitEvent(PlayerEvent.READY);
  }

  /**
   * Set manifest loading error
   */
  setManifestError(error: string): void {
    this.updateState(() => ({
      manifestLoaded: false,
      manifestError: error,
    }));

    this.emitEvent(PlayerEvent.ERROR, { code: 'MANIFEST_LOAD_FAILED', message: error });
  }

  /**
   * Navigate to a specific panel
   */
  navigateToPanel(
    chapterId: string,
    panelId: string,
    options?: {
      pageId?: string;
      addToHistory?: boolean;
      transition?: string;
    }
  ): void {
    const currentState = this.getState();
    const previousPanelId = currentState.currentPanelId;

    // Add current panel to history if requested
    const navigationHistory =
      options?.addToHistory && previousPanelId
        ? [...currentState.navigationHistory, previousPanelId]
        : currentState.navigationHistory;

    this.updateState(() => ({
      currentChapterId: chapterId,
      currentPanelId: panelId,
      currentPageId: options?.pageId || null,
      navigationHistory,
    }));

    this.emitEvent(PlayerEvent.PANEL_CHANGE, {
      chapterId,
      panelId,
      previousPanelId,
      transition: options?.transition,
    });
  }

  /**
   * Navigate back in history
   */
  navigateBack(): boolean {
    const currentState = this.getState();
    const { navigationHistory } = currentState;

    if (navigationHistory.length === 0) {
      return false;
    }

    // Pop last panel from history
    const previousPanelId = navigationHistory[navigationHistory.length - 1];
    const newHistory = navigationHistory.slice(0, -1);

    this.updateState(() => ({
      currentPanelId: previousPanelId,
      navigationHistory: newHistory,
    }));

    return true;
  }

  /**
   * Clear navigation history
   */
  clearHistory(): void {
    this.updateState(() => ({
      navigationHistory: [],
    }));
  }

  /**
   * Set view mode (page or panel)
   */
  setViewMode(viewMode: ViewMode): void {
    this.updateState(() => ({ viewMode }));
  }

  /**
   * Toggle view mode
   */
  toggleViewMode(): void {
    const current = this.getState().viewMode;
    this.setViewMode(current === 'page' ? 'panel' : 'page');
  }

  /**
   * Update viewport state
   */
  updateViewport(viewport: Partial<ViewportState>): void {
    const currentViewport = this.getState().viewport;
    this.updateState(() => ({
      viewport: { ...currentViewport, ...viewport },
    }));
  }

  /**
   * Set locale
   */
  setLocale(locale: LocaleCode): void {
    this.updateState(() => ({ locale }));
    this.emitEvent(PlayerEvent.LOCALE_CHANGE, { locale });
  }

  /**
   * Update a single preference
   */
  updatePreference<K extends keyof PlayerPreferences>(
    key: K,
    value: PlayerPreferences[K]
  ): void {
    const currentPreferences = this.getState().preferences;
    const newPreferences = { ...currentPreferences, [key]: value };

    this.updateState(() => ({
      preferences: newPreferences,
    }));

    // Persist to localStorage
    this.persistPreferences(newPreferences);

    this.emitEvent(PlayerEvent.PREFERENCE_CHANGE, { key, value });
  }

  /**
   * Update multiple preferences at once
   */
  updatePreferences(preferences: Partial<PlayerPreferences>): void {
    const currentPreferences = this.getState().preferences;
    const newPreferences = { ...currentPreferences, ...preferences };

    this.updateState(() => ({
      preferences: newPreferences,
    }));

    // Persist to localStorage
    this.persistPreferences(newPreferences);

    this.emitEvent(PlayerEvent.PREFERENCE_CHANGE, { preferences });
  }

  /**
   * Set entitlements
   */
  setEntitlements(entitlements: Record<string, boolean>): void {
    this.updateState(() => ({ entitlements }));
  }

  /**
   * Show paywall gate
   */
  showPaywallGate(gate: PaywallGate): void {
    this.updateState(() => ({
      paywallGate: gate,
      overlays: { ...this.getState().overlays, paywall: true },
    }));

    this.emitEvent(PlayerEvent.PAYWALL_SHOWN, gate);
  }

  /**
   * Hide paywall gate
   */
  hidePaywallGate(): void {
    this.updateState(() => ({
      paywallGate: null,
      overlays: { ...this.getState().overlays, paywall: false },
    }));
  }

  /**
   * Toggle an overlay
   */
  toggleOverlay(overlay: keyof OverlayState): void {
    const currentOverlays = this.getState().overlays;
    this.updateState(() => ({
      overlays: { ...currentOverlays, [overlay]: !currentOverlays[overlay] },
    }));
  }

  /**
   * Show an overlay
   */
  showOverlay(overlay: keyof OverlayState): void {
    const currentOverlays = this.getState().overlays;
    this.updateState(() => ({
      overlays: { ...currentOverlays, [overlay]: true },
    }));
  }

  /**
   * Hide an overlay
   */
  hideOverlay(overlay: keyof OverlayState): void {
    const currentOverlays = this.getState().overlays;
    this.updateState(() => ({
      overlays: { ...currentOverlays, [overlay]: false },
    }));
  }

  /**
   * Close all overlays
   */
  closeAllOverlays(): void {
    this.updateState(() => ({
      overlays: {
        toolbar: false,
        thumbnails: false,
        toc: false,
        settings: false,
        characters: false,
        extras: false,
        comments: false,
        share: false,
        contentWarning: false,
        paywall: false,
      },
    }));
  }

  /**
   * Set tracking consent
   */
  setTrackingConsent(consent: boolean): void {
    this.updateState(() => ({ trackingConsent: consent }));

    // Persist to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pw-tracking-consent', String(consent));
    }
  }

  /**
   * Update preload status
   */
  updatePreloadStatus(status: Partial<PreloadStatus>): void {
    const currentStatus = this.getState().preloadStatus;
    this.updateState(() => ({
      preloadStatus: { ...currentStatus, ...status },
    }));
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.updateState(() => ({ loading }));
  }

  /**
   * Set error state
   */
  setError(error: PlayerError | null): void {
    this.updateState(() => ({ error }));

    if (error) {
      this.emitEvent(PlayerEvent.ERROR, error);
    }
  }

  /**
   * Reset player state to initial state
   */
  reset(): void {
    this.state$.next(createInitialState());
    this.events$.next(null);
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  /**
   * Load persisted preferences from localStorage
   */
  private loadPersistedPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem('pw-preferences');
      if (stored) {
        const preferences = JSON.parse(stored) as Partial<PlayerPreferences>;
        this.updatePreferences(preferences);
      }

      // Load tracking consent
      const consent = localStorage.getItem('pw-tracking-consent');
      if (consent !== null) {
        this.updateState(() => ({ trackingConsent: consent === 'true' }));
      }
    } catch (error) {
      console.warn('[PlayerStateService] Failed to load persisted preferences:', error);
    }
  }

  /**
   * Persist preferences to localStorage
   */
  private persistPreferences(preferences: PlayerPreferences): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem('pw-preferences', JSON.stringify(preferences));
    } catch (error) {
      console.warn('[PlayerStateService] Failed to persist preferences:', error);
    }
  }
}
