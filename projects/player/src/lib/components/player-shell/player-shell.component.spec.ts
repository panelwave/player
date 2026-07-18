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
import { Subject } from 'rxjs';
import { PlayerShellComponent } from './player-shell.component';
import { PlayerStateService } from '../../services/player-state.service';
import { ManifestService } from '../../services/manifest.service';
import { VariableStoreService } from '../../services/variable-store.service';
import { FlowEngineService } from '../../services/flow-engine.service';
import { TranslationService } from '../../services/translation.service';
import { TrackingService } from '../../services/tracking.service';
import { VideoControllerService } from '../../services/video-controller.service';
import { VideoSequencerService } from '../../services/video-sequencer.service';
import { PlayerEvent } from '../../types';
import type { Chapter, Panel, PanelWaveManifest } from '../../types';

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
