/**
 * PlayerShellComponent auto-advance tests (video-panels concept §4.5 / §4.3.6).
 *
 * The shell is created with an empty template override (the full shell pulls
 * in translation/toolbar/modal trees irrelevant here) to test the autoplay
 * decision logic:
 * - panel view, video panel  → advance on media pass completion, no wall clock
 * - panel view, other panels → wall-clock durationMs/secondsPerPanel timer
 * - page view with on-view videos → advance on sequencer queue completion
 * - autoplay off → no navigation from video signals
 */

import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { PlayerShellComponent } from './player-shell.component';
import { PlayerStateService } from '../../services/player-state.service';
import { ManifestService } from '../../services/manifest.service';
import { VariableStoreService } from '../../services/variable-store.service';
import { FlowEngineService } from '../../services/flow-engine.service';
import { TranslationService } from '../../services/translation.service';
import { TrackingService } from '../../services/tracking.service';
import { VideoControllerService } from '../../services/video-controller.service';
import { VideoSequencerService } from '../../services/video-sequencer.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { PanelAudioService } from '../../services/panel-audio.service';
import { PlayerEvent } from '../../types';
import type { Chapter, Panel, PanelWaveManifest, PlayerPreferences } from '../../types';

describe('PlayerShellComponent auto-advance', () => {
  let shell: PlayerShellComponent;
  let passComplete$: Subject<string>;
  let queueComplete$: Subject<void>;
  let sequencerMock: {
    queueComplete: unknown;
    start: jasmine.Spy;
    reset: jasmine.Spy;
    getStallTimeout: jasmine.Spy;
  };
  let trackingMock: {
    configure: jasmine.Spy;
    setConsent: jasmine.Spy;
    track: jasmine.Spy;
    setSessionId: jasmine.Spy;
    flushSync: jasmine.Spy;
  };
  let manifest: Partial<PanelWaveManifest> | null;

  /** Access to the shell's private members under test. */
  const priv = () =>
    shell as unknown as {
      startAutoplay(): void;
      stopAutoplay(): void;
      subscribeToVideoSignals(): void;
      configureTracking(m: Partial<PanelWaveManifest> | null): void;
      trackPanelView(panel: Panel, chapter: Chapter): void;
      analyticsPanelOrder: Map<string, number>;
      autoplayTimer?: unknown;
      pendingVideoPasses: Set<string>;
      videoWatchdogTimer?: unknown;
    };

  const videoPanel = (startMode: string): Panel =>
    ({
      durationMs: 1000,
      layers: [
        { kind: 'video', id: 'v1', assetId: 'a1', startMode },
        { kind: 'video', id: 'v2', assetId: 'a2', startMode },
      ],
    }) as unknown as Panel;

  const imagePanel = (): Panel =>
    ({
      durationMs: 1000,
      layers: [{ kind: 'image', id: 'img1', assetId: 'a3' }],
    }) as unknown as Panel;

  beforeEach(() => {
    jasmine.clock().install();
    passComplete$ = new Subject<string>();
    queueComplete$ = new Subject<void>();
    manifest = null;

    sequencerMock = {
      queueComplete: queueComplete$.asObservable(),
      start: jasmine.createSpy('sequencer.start'),
      reset: jasmine.createSpy('sequencer.reset'),
      // Mirrors VideoSequencerService.DEFAULT_STALL_TIMEOUT_MS (10s) — the
      // panel-view watchdog reuses this configurable knob as its grace
      // margin instead of a hardcoded number.
      getStallTimeout: jasmine.createSpy('sequencer.getStallTimeout').and.returnValue(10_000),
    };
    trackingMock = {
      configure: jasmine.createSpy('tracking.configure'),
      setConsent: jasmine.createSpy('tracking.setConsent'),
      track: jasmine.createSpy('tracking.track'),
      setSessionId: jasmine.createSpy('tracking.setSessionId'),
      flushSync: jasmine.createSpy('tracking.flushSync'),
    };
    const manifestServiceMock = {
      getManifest: () => manifest,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerStateService, useValue: {} },
        { provide: ManifestService, useValue: manifestServiceMock },
        { provide: VariableStoreService, useValue: {} },
        { provide: FlowEngineService, useValue: {} },
        { provide: TranslationService, useValue: {} },
        { provide: TrackingService, useValue: trackingMock },
        {
          provide: VideoControllerService,
          useValue: { passComplete$: passComplete$.asObservable() },
        },
        { provide: VideoSequencerService, useValue: sequencerMock },
      ],
    });
    // The full template pulls in the entire toolbar/modal/viewport tree —
    // irrelevant for the autoplay decision logic under test.
    TestBed.overrideComponent(PlayerShellComponent, {
      set: { template: '', imports: [] },
    });

    shell = TestBed.createComponent(PlayerShellComponent).componentInstance;
    priv().subscribeToVideoSignals();
  });

  afterEach(() => {
    // Prevent stray async autoplay restarts (navigateNext().then chains).
    shell.autoplayEnabled = false;
    priv().stopAutoplay();
    shell.ngOnDestroy();
    jasmine.clock().uninstall();
  });

  describe('panel view — video panels (§4.5)', () => {
    beforeEach(() => {
      shell.viewMode = 'panel';
      shell.autoplayEnabled = true;
      shell.currentPanel = videoPanel('on-view');
    });

    it('waits for media pass completion instead of a wall-clock timer', () => {
      priv().startAutoplay();
      expect(priv().autoplayTimer).toBeUndefined();
      expect(priv().pendingVideoPasses.has('v1')).toBeTrue();
      expect(priv().pendingVideoPasses.has('v2')).toBeTrue();
    });

    it('advances only after ALL on-view videos completed a pass (longest wins)', () => {
      const nav = spyOn(shell, 'navigateNext').and.resolveTo();
      priv().startAutoplay();

      passComplete$.next('v1');
      expect(nav).not.toHaveBeenCalled();

      passComplete$.next('v2');
      expect(nav).toHaveBeenCalledTimes(1);
    });

    it('ignores pass completions from unrelated videos', () => {
      const nav = spyOn(shell, 'navigateNext').and.resolveTo();
      priv().startAutoplay();
      passComplete$.next('other-video');
      passComplete$.next('other-video');
      expect(nav).not.toHaveBeenCalled();
    });

    it('does not advance when autoplay is off', () => {
      shell.autoplayEnabled = false;
      const nav = spyOn(shell, 'navigateNext').and.resolveTo();
      priv().startAutoplay();
      passComplete$.next('v1');
      passComplete$.next('v2');
      expect(nav).not.toHaveBeenCalled();
    });

    it('treats panels with only on-click videos as wall-clock panels', () => {
      shell.currentPanel = videoPanel('on-click');
      priv().startAutoplay();
      expect(priv().autoplayTimer).toBeDefined();
      expect(priv().pendingVideoPasses.size).toBe(0);
    });

    it('treats video panels as wall-clock panels under reduced motion', () => {
      shell.reducedMotion = true;
      priv().startAutoplay();
      expect(priv().autoplayTimer).toBeDefined();
    });

    it('honours settings.ui start-mode defaults when the layer omits startMode', () => {
      manifest = {
        settings: { ui: { videoStartModeDefault: 'on-view' } },
      } as unknown as PanelWaveManifest;
      shell.currentPanel = {
        durationMs: 1000,
        layers: [{ kind: 'video', id: 'v1', assetId: 'a1' }],
      } as unknown as Panel;
      priv().startAutoplay();
      expect(priv().pendingVideoPasses.has('v1')).toBeTrue();
      expect(priv().autoplayTimer).toBeUndefined();
    });
  });

  describe('panel view — video watchdog fallback (§4.5 stall guard)', () => {
    // durationMs 1000 (videoPanel) + getStallTimeout() 10_000 = 11_000ms bound.
    const WATCHDOG_BOUND_MS = 11_000;

    beforeEach(() => {
      shell.viewMode = 'panel';
      shell.autoplayEnabled = true;
      shell.currentPanel = videoPanel('on-view');
    });

    it('force-advances once when no pass ever arrives (stalled/corrupt video)', () => {
      const nav = spyOn(shell, 'navigateNext').and.resolveTo();
      priv().startAutoplay();
      expect(priv().videoWatchdogTimer).toBeDefined();

      jasmine.clock().tick(WATCHDOG_BOUND_MS - 1);
      expect(nav).not.toHaveBeenCalled();

      jasmine.clock().tick(1);
      expect(nav).toHaveBeenCalledTimes(1);
      expect(priv().pendingVideoPasses.size).toBe(0);

      // One stall-skip tracking event per still-pending video (v1, v2).
      expect(trackingMock.track).toHaveBeenCalledTimes(2);
      expect(trackingMock.track).toHaveBeenCalledWith(
        PlayerEvent.VIDEO_ENDED,
        jasmine.objectContaining({ assetId: 'a1', reason: 'stall-skip', trigger: 'view' })
      );
      expect(trackingMock.track).toHaveBeenCalledWith(
        PlayerEvent.VIDEO_ENDED,
        jasmine.objectContaining({ assetId: 'a2', reason: 'stall-skip', trigger: 'view' })
      );
    });

    it('cancels the watchdog once every pending video completes its pass (no double advance)', () => {
      const nav = spyOn(shell, 'navigateNext').and.resolveTo();
      priv().startAutoplay();

      passComplete$.next('v1');
      passComplete$.next('v2');
      expect(nav).toHaveBeenCalledTimes(1);
      expect(priv().videoWatchdogTimer).toBeUndefined();

      // Even though the watchdog's original bound has long elapsed, it must
      // not fire a second, stale advance.
      jasmine.clock().tick(WATCHDOG_BOUND_MS + 5000);
      expect(nav).toHaveBeenCalledTimes(1);
      expect(trackingMock.track).not.toHaveBeenCalled();
    });

    it('tears down the watchdog when autoplay is toggled off', () => {
      const nav = spyOn(shell, 'navigateNext').and.resolveTo();
      priv().startAutoplay();
      expect(priv().videoWatchdogTimer).toBeDefined();

      shell.onToggleAutoplay(); // was enabled → turns off, stops autoplay
      expect(priv().videoWatchdogTimer).toBeUndefined();

      jasmine.clock().tick(WATCHDOG_BOUND_MS + 1);
      expect(nav).not.toHaveBeenCalled();
      expect(trackingMock.track).not.toHaveBeenCalled();
    });

    it('clears the watchdog on destroy', () => {
      const nav = spyOn(shell, 'navigateNext').and.resolveTo();
      priv().startAutoplay();
      expect(priv().videoWatchdogTimer).toBeDefined();

      shell.ngOnDestroy();
      expect(priv().videoWatchdogTimer).toBeUndefined();

      jasmine.clock().tick(WATCHDOG_BOUND_MS + 1);
      expect(nav).not.toHaveBeenCalled();
    });
  });

  describe('panel view — non-video panels (wall clock)', () => {
    beforeEach(() => {
      shell.viewMode = 'panel';
      shell.autoplayEnabled = true;
      shell.currentPanel = imagePanel();
    });

    it('advances after durationMs via the timer', () => {
      const nav = spyOn(shell, 'navigateNext').and.resolveTo();
      priv().startAutoplay();
      expect(priv().autoplayTimer).toBeDefined();

      jasmine.clock().tick(999);
      expect(nav).not.toHaveBeenCalled();
      jasmine.clock().tick(2);
      expect(nav).toHaveBeenCalledTimes(1);
    });

    it('is unaffected by video pass completions', () => {
      const nav = spyOn(shell, 'navigateNext').and.resolveTo();
      priv().startAutoplay();
      passComplete$.next('v1');
      expect(nav).not.toHaveBeenCalled();
    });

    describe('panel animations', () => {
      const animated = (animations: Panel['animations']): Panel => ({ ...imagePanel(), animations });
      const fade = [
        { layerId: 'l1', property: 'opacity' as const, timeMs: 0, value: 0 },
        { layerId: 'l1', property: 'opacity' as const, timeMs: 3000, value: 1 },
      ];

      it('stays on the panel until a longer animation has played', () => {
        shell.currentPanel = animated({ durationMs: 3000, keyframes: fade });
        const nav = spyOn(shell, 'navigateNext').and.resolveTo();
        priv().startAutoplay();

        jasmine.clock().tick(2999); // dwell time (1 s) is long over
        expect(nav).not.toHaveBeenCalled();
        jasmine.clock().tick(2);
        expect(nav).toHaveBeenCalledTimes(1);
      });

      it('waits for a camera move as well', () => {
        shell.currentPanel = animated({ durationMs: 2500, endViewportRect: { x: 0, y: 0, w: 0.5, h: 0.5 } });
        const nav = spyOn(shell, 'navigateNext').and.resolveTo();
        priv().startAutoplay();
        jasmine.clock().tick(2499);
        expect(nav).not.toHaveBeenCalled();
        jasmine.clock().tick(2);
        expect(nav).toHaveBeenCalledTimes(1);
      });

      it('keeps the dwell time for a looping animation (it never ends)', () => {
        shell.currentPanel = animated({ durationMs: 3000, loop: true, keyframes: fade });
        const nav = spyOn(shell, 'navigateNext').and.resolveTo();
        priv().startAutoplay();
        jasmine.clock().tick(1001);
        expect(nav).toHaveBeenCalledTimes(1);
      });

      it('keeps the dwell time under reduced motion (the end state shows at once)', () => {
        shell.currentPanel = animated({ durationMs: 3000, keyframes: fade });
        shell.reducedMotion = true;
        const nav = spyOn(shell, 'navigateNext').and.resolveTo();
        priv().startAutoplay();
        jasmine.clock().tick(1001);
        expect(nav).toHaveBeenCalledTimes(1);
      });

      it('keeps the dwell time in page view (several panels share the page) and turns the page', () => {
        shell.currentPanel = animated({ durationMs: 3000, keyframes: fade });
        shell.viewMode = 'page';
        const nav = spyOn(shell, 'navigateToNextPage').and.resolveTo();
        priv().startAutoplay();
        jasmine.clock().tick(1001);
        expect(nav).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('page view — queue completion coupling (§4.3.6)', () => {
    beforeEach(() => {
      shell.viewMode = 'page';
      shell.autoplayEnabled = true;
      shell.currentChapter = {
        id: 'ch',
        panels: { p1: videoPanel('on-view'), p2: imagePanel() },
        pages: [],
        graph: { entry: 'p1', edges: [] },
      } as never;
      shell.currentPage = {
        id: 'pg-1',
        layout: {
          format: 'x',
          placements: [
            { panelId: 'p1', x: 0, y: 0, w: 0.5, h: 0.5 },
            { panelId: 'p2', x: 0.5, y: 0, w: 0.5, h: 0.5 },
          ],
        },
        readingOrder: ['p1', 'p2'],
      } as never;
    });

    it('suppresses the wall-clock timer when the page has on-view videos', () => {
      priv().startAutoplay();
      expect(priv().autoplayTimer).toBeUndefined();
    });

    it('advances to the next page when the video queue completes', () => {
      const nav = spyOn(shell, 'navigateToNextPage');
      priv().startAutoplay();
      queueComplete$.next();
      expect(nav).toHaveBeenCalledTimes(1);
    });

    it('does not navigate on queue completion when autoplay is off', () => {
      shell.autoplayEnabled = false;
      const nav = spyOn(shell, 'navigateToNextPage');
      queueComplete$.next();
      expect(nav).not.toHaveBeenCalled();
    });

    it('does not navigate on queue completion in panel view', () => {
      shell.viewMode = 'panel';
      const nav = spyOn(shell, 'navigateToNextPage');
      queueComplete$.next();
      expect(nav).not.toHaveBeenCalled();
    });

    it('keeps the wall-clock timer for pages without on-view videos', () => {
      shell.currentPage = {
        id: 'pg-2',
        layout: {
          format: 'x',
          placements: [{ panelId: 'p2', x: 0, y: 0, w: 1, h: 1 }],
        },
        readingOrder: ['p2'],
      } as never;
      priv().startAutoplay();
      expect(priv().autoplayTimer).toBeDefined();
    });
  });

  describe('view/page transitions drive the sequencer lifecycle', () => {
    it('starts the sequencer when switching to page view and resets when leaving', () => {
      shell.viewMode = 'panel';
      const panel = imagePanel();
      shell.currentChapter = {
        id: 'ch',
        panels: { p1: panel },
        // findPageContainingPanel needs a page containing the current panel.
        pages: [
          {
            id: 'pg',
            layout: {
              format: 'x',
              placements: [{ panelId: 'p1', x: 0, y: 0, w: 1, h: 1 }],
            },
            readingOrder: ['p1'],
          },
        ],
        graph: { entry: 'p1', edges: [] },
      } as never;
      shell.currentPanel = panel;

      shell.onToggleView();
      expect(shell.viewMode).toBe('page');
      expect(sequencerMock.start).toHaveBeenCalled();

      shell.onToggleView();
      expect(shell.viewMode).toBe('panel');
      expect(sequencerMock.reset).toHaveBeenCalled();
    });
  });

  describe('keyboard while a dialog is open', () => {
    const key = (k: string, target: EventTarget = document.body): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: target });
      return event;
    };

    it('Escape closes the open dialog and keeps the toolbar', () => {
      shell.toolbarVisible = true;
      shell.languageModalVisible = true;
      shell.handleKeyboard(key('Escape'));
      expect(shell.languageModalVisible).toBeFalse();
      expect(shell.toolbarVisible).toBeTrue();
    });

    it('closes nested dialogs one Escape at a time (top first)', () => {
      shell.settingsVisible = true;
      shell.actionModalVisible = true;
      shell.handleKeyboard(key('Escape'));
      expect(shell.actionModalVisible).toBeFalse();
      expect(shell.settingsVisible).toBeTrue();
      shell.handleKeyboard(key('Escape'));
      expect(shell.settingsVisible).toBeFalse();
    });

    it('arrow keys do not navigate the story behind a dialog', () => {
      const next = spyOn(shell, 'navigateNext').and.resolveTo();
      shell.tocVisible = true;
      shell.handleKeyboard(key('ArrowRight'));
      expect(next).not.toHaveBeenCalled();
      shell.tocVisible = false;
      shell.handleKeyboard(key('ArrowRight'));
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('story keys do nothing while the paywall or the age gate is open', () => {
      const next = spyOn(shell, 'navigateNext').and.resolveTo();
      const prev = spyOn(shell, 'navigatePrevious').and.resolveTo();
      shell.toolbarVisible = false;
      for (const blocker of ['paywallVisible', 'ageGateVisible'] as const) {
        shell[blocker] = true;
        shell.handleKeyboard(key('ArrowRight'));
        shell.handleKeyboard(key('ArrowLeft'));
        shell.handleKeyboard(key('t'));
        shell.onSwipe('left');
        shell[blocker] = false;
      }
      expect(next).not.toHaveBeenCalled();
      expect(prev).not.toHaveBeenCalled();
      expect(shell.toolbarVisible).toBeFalse();
    });

    it('arrow keys inside a select (age gate birth date) never reach the story', () => {
      const next = spyOn(shell, 'navigateNext').and.resolveTo();
      shell.handleKeyboard(key('ArrowRight', document.createElement('select')));
      expect(next).not.toHaveBeenCalled();
    });

    it('an Escape that a dialog already handled does not hide the toolbar', () => {
      shell.toolbarVisible = true;
      const host = document.createElement('pw-toc-overlay');
      const event = key('Escape', host);
      spyOn(event, 'composedPath').and.returnValue([host, document.body, document, window]);
      shell.handleKeyboard(event);
      expect(shell.toolbarVisible).toBeTrue();

      shell.handleKeyboard(key('Escape'));
      expect(shell.toolbarVisible).toBeFalse();
    });
  });

  describe('tracking configuration from the manifest', () => {
    it('configures consent, whitelist and endpoint', () => {
      priv().configureTracking({
        tracking: {
          enabled: true,
          consent: { required: true, defaultOptIn: true },
          eventWhitelist: ['videoPlay'],
          endpoint: 'https://t.example/collect',
        },
      } as unknown as PanelWaveManifest);

      expect(trackingMock.configure).toHaveBeenCalledWith({
        consentRequired: true,
        eventWhitelist: ['videoPlay'],
        endpoint: 'https://t.example/collect',
      });
      expect(trackingMock.setConsent).toHaveBeenCalledWith(true);
    });

    it('does not grant consent without defaultOptIn', () => {
      priv().configureTracking({
        tracking: { enabled: true, consent: { required: true, defaultOptIn: false } },
      } as unknown as PanelWaveManifest);
      expect(trackingMock.setConsent).not.toHaveBeenCalled();
    });

    it('does nothing without a tracking section', () => {
      priv().configureTracking(null);
      expect(trackingMock.configure).not.toHaveBeenCalled();
    });
  });

  describe('analytics session instrumentation', () => {
    /** Two-chapter manifest: ch1 p1→p2, ch2 p3→p4 (p4 = end of work). */
    const analyticsManifest = (): PanelWaveManifest =>
      ({
        tracking: { enabled: true, consent: { required: false } },
        chapters: [
          {
            id: 'ch1',
            panels: { p1: { layers: [] }, p2: { layers: [] } },
            graph: { entry: 'p1', edges: [{ from: 'p1', to: 'p2' }] },
          },
          {
            id: 'ch2',
            panels: { p3: { layers: [] }, p4: { layers: [] } },
            graph: { entry: 'p3', edges: [{ from: 'p3', to: 'p4' }] },
          },
        ],
      }) as unknown as PanelWaveManifest;

    beforeEach(() => {
      TestBed.inject(FlowEngineService).getEntry = ((graph: { entry: string }) =>
        graph.entry) as never;
    });

    it('emits session_start with device, locale and the cross-chapter panel count', () => {
      manifest = analyticsManifest();
      priv().configureTracking(manifest);

      expect(trackingMock.track).toHaveBeenCalledWith(
        'session_start',
        jasmine.objectContaining({ totalPanels: 4, locale: shell.locale })
      );
      // BFS reading order across chapters: p1, p2, p3, p4
      expect(priv().analyticsPanelOrder.get('p1')).toBe(1);
      expect(priv().analyticsPanelOrder.get('p4')).toBe(4);
    });

    it('tracks panel_view with panelOrder and work_complete only on the final panel', () => {
      manifest = analyticsManifest();
      priv().configureTracking(manifest);
      trackingMock.track.calls.reset();

      const ch1 = (manifest as never as { chapters: Chapter[] }).chapters[0];
      const ch2 = (manifest as never as { chapters: Chapter[] }).chapters[1];

      priv().trackPanelView(ch1.panels['p2'], ch1);
      expect(trackingMock.track).toHaveBeenCalledWith('panel_view', {
        panelId: 'p2',
        chapterId: 'ch1',
        panelOrder: 2,
      });
      // p2 has no outgoing edges but ch1 is not the last chapter
      expect(trackingMock.track).not.toHaveBeenCalledWith(
        'work_complete',
        jasmine.anything()
      );

      priv().trackPanelView(ch2.panels['p4'], ch2);
      expect(trackingMock.track).toHaveBeenCalledWith('work_complete', {
        panelId: 'p4',
        chapterId: 'ch2',
      });
    });

    it('deduplicates immediate re-emissions of the same panel', () => {
      manifest = analyticsManifest();
      priv().configureTracking(manifest);
      trackingMock.track.calls.reset();

      const ch1 = (manifest as never as { chapters: Chapter[] }).chapters[0];
      priv().trackPanelView(ch1.panels['p1'], ch1);
      priv().trackPanelView(ch1.panels['p1'], ch1);

      expect(trackingMock.track).toHaveBeenCalledTimes(1);
    });

    it('emits session_end and beacon-flushes exactly once on destroy', () => {
      manifest = analyticsManifest();
      priv().configureTracking(manifest);

      shell.ngOnDestroy();
      shell.ngOnDestroy();

      const endCalls = trackingMock.track.calls
        .allArgs()
        .filter((args) => args[0] === 'session_end');
      expect(endCalls.length).toBe(1);
      expect(trackingMock.flushSync).toHaveBeenCalledTimes(1);
    });
  });
});

describe('PlayerShellComponent audio / SFX / speech toggles', () => {
  let shell: PlayerShellComponent;
  let engine: jasmine.SpyObj<AudioEngineService>;
  let panelAudio: jasmine.SpyObj<PanelAudioService>;
  let tracking: { track: jasmine.Spy };
  let manifest: Partial<PanelWaveManifest> | null;
  let prefs: PlayerPreferences;
  let explicit: Set<string>;
  let stateMock: {
    getPreferences: () => PlayerPreferences;
    hasPersistedPreference: (key: string) => boolean;
    updatePreference: jasmine.Spy;
    updatePreferences: jasmine.Spy;
    setCurrentPanel: jasmine.Spy;
    currentPanel$: unknown;
    locale$: unknown;
  };

  const priv = () =>
    shell as unknown as {
      initializeAudioPreferences(m: Partial<PanelWaveManifest> | null): void;
      refreshResolvedPanels(): void;
      stopAutoplay(): void;
    };

  beforeEach(() => {
    manifest = null;
    explicit = new Set<string>();
    prefs = {
      speech: true,
      audio: true,
      sfx: true,
      autoplay: false,
      secondsPerPanel: 5,
      mangaMode: false,
      reducedMotion: false,
      highContrast: false,
      masterVolume: 0.7,
      sfxVolume: 0.4,
    };
    stateMock = {
      getPreferences: () => prefs,
      hasPersistedPreference: (key: string) => explicit.has(key),
      updatePreference: jasmine.createSpy('state.updatePreference').and.callFake(
        (key: keyof PlayerPreferences, value: unknown) => {
          prefs = { ...prefs, [key]: value };
          explicit.add(key);
        }
      ),
      updatePreferences: jasmine.createSpy('state.updatePreferences').and.callFake(
        (patch: Partial<PlayerPreferences>) => {
          prefs = { ...prefs, ...patch };
          Object.keys(patch).forEach((k) => explicit.add(k));
        }
      ),
      setCurrentPanel: jasmine.createSpy('state.setCurrentPanel'),
      currentPanel$: new Subject(),
      locale$: new Subject(),
    };
    engine = jasmine.createSpyObj<AudioEngineService>('AudioEngineService', [
      'setMasterVolume',
      'setRoleVolume',
      'setMasterMuted',
      'setRoleMuted',
    ]);
    panelAudio = jasmine.createSpyObj<PanelAudioService>('PanelAudioService', [
      'syncPanel',
      'stopAll',
    ]);
    tracking = { track: jasmine.createSpy('tracking.track') };

    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerStateService, useValue: stateMock },
        { provide: ManifestService, useValue: { getManifest: () => manifest } },
        { provide: VariableStoreService, useValue: {} },
        { provide: FlowEngineService, useValue: {} },
        { provide: TranslationService, useValue: {} },
        { provide: TrackingService, useValue: tracking },
        { provide: VideoControllerService, useValue: { passComplete$: new Subject() } },
        {
          provide: VideoSequencerService,
          useValue: {
            queueComplete: new Subject(),
            start: jasmine.createSpy('start'),
            reset: jasmine.createSpy('reset'),
            getStallTimeout: () => 10_000,
          },
        },
        { provide: AudioEngineService, useValue: engine },
        { provide: PanelAudioService, useValue: panelAudio },
      ],
    });
    TestBed.overrideComponent(PlayerShellComponent, {
      set: { template: '', imports: [] },
    });
    shell = TestBed.createComponent(PlayerShellComponent).componentInstance;
  });

  afterEach(() => {
    shell.autoplayEnabled = false;
    priv().stopAutoplay();
  });

  describe('initial state', () => {
    it('seeds the toggles from settings.ui defaults when the reader has not chosen', () => {
      manifest = {
        settings: { ui: { audioDefault: false, sfxDefault: false, speechDefault: true } },
      } as Partial<PanelWaveManifest>;

      priv().initializeAudioPreferences(manifest);

      expect(shell.audioEnabled).toBe(false);
      expect(shell.sfxEnabled).toBe(false);
      expect(shell.speechEnabled).toBe(true);
      expect(engine.setMasterMuted).toHaveBeenCalledWith(true);
      expect(engine.setRoleMuted).toHaveBeenCalledWith('sfx', true);
      expect(engine.setRoleMuted).toHaveBeenCalledWith('voiceover', false);
      // Stored volumes reach the mixer independently of the mute flags.
      expect(engine.setMasterVolume).toHaveBeenCalledWith(0.7);
      expect(engine.setRoleVolume).toHaveBeenCalledWith('sfx', 0.4);
    });

    it('defaults every toggle to on without ui settings', () => {
      priv().initializeAudioPreferences(null);

      expect(shell.audioEnabled).toBe(true);
      expect(shell.sfxEnabled).toBe(true);
      expect(shell.speechEnabled).toBe(true);
      expect(engine.setMasterMuted).toHaveBeenCalledWith(false);
    });

    it('a preference the reader set wins over the work default', () => {
      manifest = { settings: { ui: { audioDefault: false } } } as Partial<PanelWaveManifest>;
      explicit.add('audio');
      prefs = { ...prefs, audio: true };

      priv().initializeAudioPreferences(manifest);

      expect(shell.audioEnabled).toBe(true);
      expect(engine.setMasterMuted).toHaveBeenCalledWith(false);
    });
  });

  describe('toolbar toggles', () => {
    it('Audio toggles the engine master mute, persists and tracks', () => {
      shell.onToggleAudio();

      expect(shell.audioEnabled).toBe(false);
      expect(engine.setMasterMuted).toHaveBeenCalledWith(true);
      expect(stateMock.updatePreference).toHaveBeenCalledWith('audio', false);
      expect(tracking.track).toHaveBeenCalledWith('audio_toggle', { enabled: false });

      shell.onToggleAudio();

      expect(shell.audioEnabled).toBe(true);
      expect(engine.setMasterMuted).toHaveBeenCalledWith(false);
      expect(stateMock.updatePreference).toHaveBeenCalledWith('audio', true);
    });

    it('SFX toggles only the sfx bus', () => {
      shell.onToggleSfx();

      expect(shell.sfxEnabled).toBe(false);
      expect(engine.setRoleMuted).toHaveBeenCalledWith('sfx', true);
      expect(engine.setMasterMuted).toHaveBeenCalledWith(false);
      expect(stateMock.updatePreference).toHaveBeenCalledWith('sfx', false);
      expect(tracking.track).toHaveBeenCalledWith('sfx_toggle', { enabled: false });
    });

    it('Speech also gates the voiceover bus', () => {
      shell.onToggleSpeech();

      expect(shell.speechEnabled).toBe(false);
      expect(engine.setRoleMuted).toHaveBeenCalledWith('voiceover', true);
      expect(stateMock.updatePreference).toHaveBeenCalledWith('speech', false);
      expect(tracking.track).toHaveBeenCalledWith('speech_toggle', { enabled: false });
    });

    it('setting the same value again is a no-op', () => {
      shell.setAudioEnabled(true);

      expect(engine.setMasterMuted).not.toHaveBeenCalled();
      expect(stateMock.updatePreference).not.toHaveBeenCalled();
    });
  });

  describe('settings modal', () => {
    it('opening snapshots the current toggle states for the Preferences tab', () => {
      shell.variableDefinitions = [];
      shell.onToggleAudio();
      shell.secondsPerPanel = 7;

      shell.onOpenSettings();

      expect(shell.settingsPreferences).toEqual(
        jasmine.objectContaining({ audio: false, sfx: true, speech: true, secondsPerPanel: 7 })
      );
    });

    it('save applies audio/sfx/speech, timing and persists the rest', () => {
      shell.onPreferencesChange({
        speech: false,
        audio: false,
        sfx: true,
        autoplay: false,
        secondsPerPanel: 9,
        mangaMode: true,
        reducedMotion: false,
        highContrast: true,
      });

      expect(shell.audioEnabled).toBe(false);
      expect(shell.speechEnabled).toBe(false);
      expect(shell.sfxEnabled).toBe(true);
      expect(shell.secondsPerPanel).toBe(9);
      expect(engine.setMasterMuted).toHaveBeenCalledWith(true);
      expect(engine.setRoleMuted).toHaveBeenCalledWith('voiceover', true);
      expect(stateMock.updatePreferences).toHaveBeenCalledWith(
        jasmine.objectContaining({ mangaMode: true, highContrast: true, secondsPerPanel: 9 })
      );
    });
  });

  describe('panel audio', () => {
    it('hands the effective panel and variable context to PanelAudioService', () => {
      const panel = { layers: [] } as unknown as Panel;
      shell.currentChapter = {
        id: 'c1',
        panels: { p1: panel },
        graph: { entry: 'p1', edges: [] },
      } as unknown as Chapter;
      shell.currentPanel = panel;

      priv().refreshResolvedPanels();

      expect(panelAudio.syncPanel).toHaveBeenCalled();
      const args = panelAudio.syncPanel.calls.mostRecent().args;
      expect(args[0]).toBe('p1');
      expect(args[1]).toBe(panel);
    });

    it('stops panel audio on destroy', () => {
      shell.ngOnDestroy();

      expect(panelAudio.stopAll).toHaveBeenCalled();
    });
  });
});

describe('PlayerShellComponent reduced motion', () => {
  let shell: PlayerShellComponent;
  let prefs$: BehaviorSubject<Partial<PlayerPreferences>>;
  let mediaListener: ((e: MediaQueryListEvent) => void) | null;
  let mediaMatches: boolean;

  const watch = () => (shell as unknown as { watchReducedMotion(): void }).watchReducedMotion();

  beforeEach(() => {
    prefs$ = new BehaviorSubject<Partial<PlayerPreferences>>({ reducedMotion: false });
    mediaListener = null;
    mediaMatches = false;
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          matches: mediaMatches,
          media: query,
          addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => (mediaListener = cb),
          removeEventListener: () => (mediaListener = null),
        }) as unknown as MediaQueryList
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerStateService, useValue: { preferences$: prefs$, getPreferences: () => prefs$.value } },
        { provide: ManifestService, useValue: { getManifest: () => null } },
        { provide: VariableStoreService, useValue: {} },
        { provide: FlowEngineService, useValue: {} },
        { provide: TranslationService, useValue: {} },
        { provide: TrackingService, useValue: { track: () => undefined } },
        { provide: VideoControllerService, useValue: { passComplete$: new Subject() } },
        { provide: VideoSequencerService, useValue: { queueComplete: new Subject(), reset: () => undefined } },
        { provide: AudioEngineService, useValue: {} },
        { provide: PanelAudioService, useValue: { stopAll: () => undefined } },
      ],
    });
    TestBed.overrideComponent(PlayerShellComponent, { set: { template: '', imports: [] } });
    shell = TestBed.createComponent(PlayerShellComponent).componentInstance;
  });

  it('is off by default', () => {
    watch();
    expect(shell.motionReduced).toBeFalse();
  });

  it('follows the host input', () => {
    shell.reducedMotion = true;
    expect(shell.motionReduced).toBeTrue();
  });

  it("follows the reader's Settings preference", () => {
    watch();
    prefs$.next({ reducedMotion: true });
    expect(shell.motionReduced).toBeTrue();
    prefs$.next({ reducedMotion: false });
    expect(shell.motionReduced).toBeFalse();
  });

  it('follows the OS prefers-reduced-motion setting, live', () => {
    mediaMatches = true;
    watch();
    expect(shell.motionReduced).toBeTrue();
    mediaListener?.({ matches: false } as MediaQueryListEvent);
    expect(shell.motionReduced).toBeFalse();
    mediaListener?.({ matches: true } as MediaQueryListEvent);
    expect(shell.motionReduced).toBeTrue();
  });
});
