/**
 * Unit tests for PlayerStateService
 */

import { TestBed } from '@angular/core/testing';
import { PlayerStateService } from './player-state.service';
import { PlayerEvent } from '../types';
import type {
  PanelWaveManifest,
  ViewMode,
  PaywallGate,
} from '../types';

describe('PlayerStateService', () => {
  let service: PlayerStateService;

  // Mock manifest for testing
  const mockManifest: PanelWaveManifest = {
    panelwave: {
      version: '1.0.0',
      schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json',
    },
    meta: {
      id: 'test-work',
      title: { 'en-US': 'Test Work' },
      locales: ['en-US'],
      default_locale: 'en-US',
    },
    chapters: [
      {
        id: 'ch-1',
        panels: {
          'p-1': { layers: [] },
        },
        graph: {
          entry: 'p-1',
          edges: [],
        },
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PlayerStateService],
    });
    service = TestBed.inject(PlayerStateService);

    // Clear localStorage before each test
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should have initial state', () => {
      const state = service.getState();
      expect(state.manifest).toBeNull();
      expect(state.manifestLoaded).toBe(false);
      expect(state.currentPanelId).toBeNull();
      expect(state.viewMode).toBe('panel');
      expect(state.locale).toBe('en-US');
    });

    it('should generate unique session ID', () => {
      const state = service.getState();
      expect(state.sessionId).toMatch(/^pw-\d+-[a-z0-9]+$/);
    });

    it('should have default preferences', () => {
      const state = service.getState();
      expect(state.preferences.speech).toBe(true);
      expect(state.preferences.audio).toBe(true);
      expect(state.preferences.sfx).toBe(true);
      expect(state.preferences.autoplay).toBe(false);
      expect(state.preferences.mangaMode).toBe(false);
    });
  });

  describe('Selectors', () => {
    it('should provide manifest$ observable', (done) => {
      service.manifest$.subscribe((manifest) => {
        expect(manifest).toBeNull(); // Initial value
        done();
      });
    });

    it('should provide manifestLoaded$ observable', (done) => {
      service.manifestLoaded$.subscribe((loaded) => {
        expect(loaded).toBe(false); // Initial value
        done();
      });
    });

    it('should provide currentPanelId$ observable', (done) => {
      service.currentPanelId$.subscribe((panelId) => {
        expect(panelId).toBeNull(); // Initial value
        done();
      });
    });

    it('should provide viewMode$ observable', (done) => {
      service.viewMode$.subscribe((viewMode) => {
        expect(viewMode).toBe('panel'); // Initial value
        done();
      });
    });

    it('should provide locale$ observable', (done) => {
      service.locale$.subscribe((locale) => {
        expect(locale).toBe('en-US'); // Initial value
        done();
      });
    });

    it('should emit distinctUntilChanged values', (done) => {
      const emissions: ViewMode[] = [];
      
      service.viewMode$.subscribe((viewMode) => {
        emissions.push(viewMode);
      });

      service.setViewMode('page');
      service.setViewMode('page'); // Same value, should not emit
      service.setViewMode('panel');

      setTimeout(() => {
        expect(emissions.length).toBe(3); // Initial + 2 changes (duplicate filtered)
        done();
      }, 100);
    });
  });

  describe('Manifest Actions', () => {
    it('should set manifest', () => {
      service.setManifest(mockManifest);

      const state = service.getState();
      expect(state.manifest).toBe(mockManifest);
      expect(state.manifestLoaded).toBe(true);
      expect(state.manifestError).toBeNull();
      expect(state.currentWorkId).toBe('test-work');
    });

    it('should emit READY event when manifest is set', (done) => {
      service.events.subscribe((event) => {
        expect(event.type).toBe(PlayerEvent.READY);
        done();
      });

      service.setManifest(mockManifest);
    });

    it('should set manifest error', () => {
      service.setManifestError('Failed to load');

      const state = service.getState();
      expect(state.manifestLoaded).toBe(false);
      expect(state.manifestError).toBe('Failed to load');
    });

    it('should emit ERROR event when manifest error is set', (done) => {
      service.events.subscribe((event) => {
        expect(event.type).toBe(PlayerEvent.ERROR);
        expect(event.payload).toEqual({
          code: 'MANIFEST_LOAD_FAILED',
          message: 'Failed to load',
        });
        done();
      });

      service.setManifestError('Failed to load');
    });
  });

  describe('Navigation Actions', () => {
    it('should navigate to panel', () => {
      service.navigateToPanel('ch-1', 'p-1');

      const state = service.getState();
      expect(state.currentChapterId).toBe('ch-1');
      expect(state.currentPanelId).toBe('p-1');
    });

    it('should navigate to panel with page ID', () => {
      service.navigateToPanel('ch-1', 'p-1', { pageId: 'page-1' });

      const state = service.getState();
      expect(state.currentPageId).toBe('page-1');
    });

    it('should add to history when requested', () => {
      // Navigate to first panel
      service.navigateToPanel('ch-1', 'p-1');
      
      // Navigate to second panel with history
      service.navigateToPanel('ch-1', 'p-2', { addToHistory: true });

      const state = service.getState();
      expect(state.navigationHistory).toEqual(['p-1']);
    });

    it('should not add to history by default', () => {
      service.navigateToPanel('ch-1', 'p-1');
      service.navigateToPanel('ch-1', 'p-2');

      const state = service.getState();
      expect(state.navigationHistory.length).toBe(0);
    });

    it('should emit PANEL_CHANGE event', (done) => {
      service.events.subscribe((event) => {
        expect(event.type).toBe(PlayerEvent.PANEL_CHANGE);
        expect(event.payload).toEqual({
          chapterId: 'ch-1',
          panelId: 'p-1',
          previousPanelId: null,
          transition: undefined,
        });
        done();
      });

      service.navigateToPanel('ch-1', 'p-1');
    });

    it('should navigate back in history', () => {
      service.navigateToPanel('ch-1', 'p-1');
      service.navigateToPanel('ch-1', 'p-2', { addToHistory: true });
      service.navigateToPanel('ch-1', 'p-3', { addToHistory: true });

      const success = service.navigateBack();

      expect(success).toBe(true);
      const state = service.getState();
      expect(state.currentPanelId).toBe('p-2');
      expect(state.navigationHistory).toEqual(['p-1']);
    });

    it('should return false when navigating back with empty history', () => {
      const success = service.navigateBack();
      expect(success).toBe(false);
    });

    it('should clear navigation history', () => {
      service.navigateToPanel('ch-1', 'p-1');
      service.navigateToPanel('ch-1', 'p-2', { addToHistory: true });

      service.clearHistory();

      const state = service.getState();
      expect(state.navigationHistory.length).toBe(0);
    });
  });

  describe('View Mode Actions', () => {
    it('should set view mode', () => {
      service.setViewMode('page');

      const state = service.getState();
      expect(state.viewMode).toBe('page');
    });

    it('should toggle view mode', () => {
      expect(service.getState().viewMode).toBe('panel');

      service.toggleViewMode();
      expect(service.getState().viewMode).toBe('page');

      service.toggleViewMode();
      expect(service.getState().viewMode).toBe('panel');
    });
  });

  describe('Viewport Actions', () => {
    it('should update viewport', () => {
      service.updateViewport({ panX: 10, panY: 20, zoom: 1.5 });

      const state = service.getState();
      expect(state.viewport.panX).toBe(10);
      expect(state.viewport.panY).toBe(20);
      expect(state.viewport.zoom).toBe(1.5);
    });

    it('should merge viewport updates', () => {
      service.updateViewport({ panX: 10 });
      service.updateViewport({ panY: 20 });

      const state = service.getState();
      expect(state.viewport.panX).toBe(10);
      expect(state.viewport.panY).toBe(20);
      expect(state.viewport.zoom).toBe(1); // Default value preserved
    });
  });

  describe('Locale Actions', () => {
    it('should set locale', () => {
      service.setLocale('de-DE');

      const state = service.getState();
      expect(state.locale).toBe('de-DE');
    });

    it('should emit LOCALE_CHANGE event', (done) => {
      service.events.subscribe((event) => {
        expect(event.type).toBe(PlayerEvent.LOCALE_CHANGE);
        expect(event.payload).toEqual({ locale: 'fr-FR' });
        done();
      });

      service.setLocale('fr-FR');
    });
  });

  describe('Preference Actions', () => {
    it('should update single preference', () => {
      service.updatePreference('speech', false);

      const state = service.getState();
      expect(state.preferences.speech).toBe(false);
    });

    it('should update multiple preferences', () => {
      service.updatePreferences({
        speech: false,
        audio: false,
        mangaMode: true,
      });

      const state = service.getState();
      expect(state.preferences.speech).toBe(false);
      expect(state.preferences.audio).toBe(false);
      expect(state.preferences.mangaMode).toBe(true);
      expect(state.preferences.sfx).toBe(true); // Unchanged
    });

    it('should emit PREFERENCE_CHANGE event', (done) => {
      service.events.subscribe((event) => {
        expect(event.type).toBe(PlayerEvent.PREFERENCE_CHANGE);
        done();
      });

      service.updatePreference('autoplay', true);
    });

    it('should persist preferences to localStorage', () => {
      if (typeof localStorage === 'undefined') {
        pending('localStorage not available');
        return;
      }

      service.updatePreference('mangaMode', true);

      const stored = localStorage.getItem('pw-preferences');
      expect(stored).toBeTruthy();

      const preferences = JSON.parse(stored!);
      expect(preferences.mangaMode).toBe(true);
    });

    it('should load persisted preferences on initialization', () => {
      if (typeof localStorage === 'undefined') {
        pending('localStorage not available');
        return;
      }

      // Set preferences in localStorage
      const prefs = {
        speech: false,
        audio: false,
        mangaMode: true,
      };
      localStorage.setItem('pw-preferences', JSON.stringify(prefs));

      // Create new service instance
      const newService = new PlayerStateService();

      const state = newService.getState();
      expect(state.preferences.speech).toBe(false);
      expect(state.preferences.audio).toBe(false);
      expect(state.preferences.mangaMode).toBe(true);
    });
  });

  describe('Entitlement Actions', () => {
    it('should set entitlements', () => {
      const entitlements = {
        premium: true,
        purchased: true,
      };

      service.setEntitlements(entitlements);

      const state = service.getState();
      expect(state.entitlements).toEqual(entitlements);
    });
  });

  describe('Paywall Actions', () => {
    const mockGate: PaywallGate = {
      scope: 'chapter',
      refId: 'ch-2',
      requireEntitlement: 'premium',
      reason: 'Premium content',
    };

    it('should show paywall gate', () => {
      service.showPaywallGate(mockGate);

      const state = service.getState();
      expect(state.paywallGate).toBe(mockGate);
      expect(state.overlays.paywall).toBe(true);
    });

    it('should emit PAYWALL_SHOWN event', (done) => {
      service.events.subscribe((event) => {
        expect(event.type).toBe(PlayerEvent.PAYWALL_SHOWN);
        expect(event.payload).toBe(mockGate);
        done();
      });

      service.showPaywallGate(mockGate);
    });

    it('should hide paywall gate', () => {
      service.showPaywallGate(mockGate);
      service.hidePaywallGate();

      const state = service.getState();
      expect(state.paywallGate).toBeNull();
      expect(state.overlays.paywall).toBe(false);
    });
  });

  describe('Overlay Actions', () => {
    it('should toggle overlay', () => {
      service.toggleOverlay('toolbar');
      expect(service.getState().overlays.toolbar).toBe(true);

      service.toggleOverlay('toolbar');
      expect(service.getState().overlays.toolbar).toBe(false);
    });

    it('should show overlay', () => {
      service.showOverlay('settings');
      expect(service.getState().overlays.settings).toBe(true);
    });

    it('should hide overlay', () => {
      service.showOverlay('toc');
      service.hideOverlay('toc');
      expect(service.getState().overlays.toc).toBe(false);
    });

    it('should close all overlays', () => {
      service.showOverlay('toolbar');
      service.showOverlay('settings');
      service.showOverlay('toc');

      service.closeAllOverlays();

      const state = service.getState();
      expect(state.overlays.toolbar).toBe(false);
      expect(state.overlays.settings).toBe(false);
      expect(state.overlays.toc).toBe(false);
    });
  });

  describe('Tracking Actions', () => {
    it('should set tracking consent', () => {
      service.setTrackingConsent(true);

      const state = service.getState();
      expect(state.trackingConsent).toBe(true);
    });

    it('should persist tracking consent to localStorage', () => {
      if (typeof localStorage === 'undefined') {
        pending('localStorage not available');
        return;
      }

      service.setTrackingConsent(true);

      const stored = localStorage.getItem('pw-tracking-consent');
      expect(stored).toBe('true');
    });
  });

  describe('Preload Actions', () => {
    it('should update preload status', () => {
      service.updatePreloadStatus({
        queueSize: 5,
        inFlight: 2,
        completed: 3,
      });

      const state = service.getState();
      expect(state.preloadStatus.queueSize).toBe(5);
      expect(state.preloadStatus.inFlight).toBe(2);
      expect(state.preloadStatus.completed).toBe(3);
    });
  });

  describe('Loading and Error Actions', () => {
    it('should set loading state', () => {
      service.setLoading(true);
      expect(service.getState().loading).toBe(true);

      service.setLoading(false);
      expect(service.getState().loading).toBe(false);
    });

    it('should set error state', () => {
      const error = {
        code: 'PANEL_NOT_FOUND' as const,
        message: 'Panel not found',
        recoverable: true,
      };

      service.setError(error);

      const state = service.getState();
      expect(state.error).toBe(error);
    });

    it('should emit ERROR event when error is set', (done) => {
      const error = {
        code: 'UNKNOWN_ERROR' as const,
        message: 'Something went wrong',
        recoverable: false,
      };

      service.events.subscribe((event) => {
        expect(event.type).toBe(PlayerEvent.ERROR);
        expect(event.payload).toBe(error);
        done();
      });

      service.setError(error);
    });

    it('should clear error', () => {
      const error = {
        code: 'PANEL_NOT_FOUND' as const,
        message: 'Panel not found',
        recoverable: true,
      };

      service.setError(error);
      service.setError(null);

      expect(service.getState().error).toBeNull();
    });
  });

  describe('Reset Action', () => {
    it('should reset to initial state', () => {
      // Modify state
      service.setManifest(mockManifest);
      service.navigateToPanel('ch-1', 'p-1');
      service.setLocale('de-DE');
      service.updatePreference('mangaMode', true);

      // Reset
      service.reset();

      const state = service.getState();
      expect(state.manifest).toBeNull();
      expect(state.currentPanelId).toBeNull();
      expect(state.locale).toBe('en-US');
      expect(state.preferences.mangaMode).toBe(false);
    });
  });

  describe('State Immutability', () => {
    it('should not mutate previous state when updating', () => {
      const state1 = service.getState();
      const originalLocale = state1.locale;

      service.setLocale('de-DE');

      expect(state1.locale).toBe(originalLocale); // Original unchanged
      expect(service.getState().locale).toBe('de-DE'); // New state updated
    });

    it('should create new objects for nested state', () => {
      const state1 = service.getState();
      const originalViewport = state1.viewport;

      service.updateViewport({ panX: 100 });

      expect(state1.viewport).toBe(originalViewport); // Original unchanged
      expect(service.getState().viewport).not.toBe(originalViewport); // New object
    });
  });
});
