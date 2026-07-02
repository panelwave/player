/**
 * VideoSequencerService tests — page-view sequential playback per the
 * video-panels concept §4.3/§7: reading-order queue with placement-order
 * fallback, append/remove on visibility change, pass-completion advance
 * (loop keeps playing), one-slot-per-panel with longest-pass semantics,
 * stall-skip, unmuted-user-video pause/resume, queue-completion signal.
 */

import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import {
  VideoSequencerService,
  DEFAULT_STALL_TIMEOUT_MS,
  type SequencedVideo,
} from './video-sequencer.service';
import {
  VisibilityService,
  type VisibilityChange,
} from './visibility.service';

interface TestVideo extends SequencedVideo {
  activate: jasmine.Spy;
  deactivate: jasmine.Spy;
  onStallSkip: jasmine.Spy;
}

describe('VideoSequencerService', () => {
  let service: VideoSequencerService;
  let changes$: Subject<VisibilityChange>;
  let supported: boolean;
  let visibleIds: Set<string>;
  let queueCompletions: number;

  const makeVideo = (
    id: string,
    panelId: string,
    overrides: Partial<SequencedVideo> = {}
  ): TestVideo =>
    ({
      id,
      panelId,
      placementId: panelId,
      readingOrderIndex: -1,
      z: 0,
      y: 0,
      x: 0,
      sequenced: true,
      element: document.createElement('div'),
      activate: jasmine.createSpy(`${id}.activate`),
      deactivate: jasmine.createSpy(`${id}.deactivate`),
      onStallSkip: jasmine.createSpy(`${id}.onStallSkip`),
      ...overrides,
    }) as TestVideo;

  beforeEach(() => {
    changes$ = new Subject<VisibilityChange>();
    supported = false; // default: treat everything as visible on register
    visibleIds = new Set<string>();

    const visibilityMock: Partial<VisibilityService> = {
      changes: changes$.asObservable(),
      isSupported: () => supported,
      isVisible: (id: string) => visibleIds.has(id),
      observe: jasmine.createSpy('observe'),
      unobserve: jasmine.createSpy('unobserve'),
      clear: jasmine.createSpy('clear'),
    };

    TestBed.configureTestingModule({
      providers: [
        VideoSequencerService,
        { provide: VisibilityService, useValue: visibilityMock },
      ],
    });

    service = TestBed.inject(VideoSequencerService);
    queueCompletions = 0;
    service.queueComplete.subscribe(() => queueCompletions++);
  });

  afterEach(() => {
    service.reset();
  });

  describe('queue ordering', () => {
    it('plays visible on-view videos in reading order', () => {
      service.start();
      const v3 = makeVideo('v3', 'p3', { readingOrderIndex: 2 });
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      const v2 = makeVideo('v2', 'p2', { readingOrderIndex: 1 });
      // Register out of order.
      service.register(v3);
      service.register(v1);
      service.register(v2);

      // v3 registered first and the queue was idle → it plays immediately
      // (the queue cannot retroactively reorder an already-started slot).
      expect(v3.activate).toHaveBeenCalled();
      expect(service.getActivePanelId()).toBe('p3');

      // Remaining entries are ordered by reading order.
      expect(service.getQueue()).toEqual(['p1', 'p2']);

      service.notifyPassComplete('v3');
      expect(v1.activate).toHaveBeenCalled();
      service.notifyPassComplete('v1');
      expect(v2.activate).toHaveBeenCalled();
    });

    it('falls back to placement order (z, then y, then x) without reading order', () => {
      service.start();
      // Occupy the active slot so subsequent registrations stay queued.
      const active = makeVideo('v0', 'p0', { readingOrderIndex: 0 });
      service.register(active);
      expect(service.getActivePanelId()).toBe('p0');

      const byX = makeVideo('vx', 'px', { y: 0.5, x: 0.8 });
      const byZ = makeVideo('vz', 'pz', { z: 1, y: 0, x: 0 });
      const byY = makeVideo('vy', 'py', { y: 0.5, x: 0.2 });
      service.register(byX);
      service.register(byZ);
      service.register(byY);

      // z sorts last only when higher; z=0 entries sort by y then x.
      expect(service.getQueue()).toEqual(['py', 'px', 'pz']);
    });

    it('orders reading-order panels before fallback-ordered ones', () => {
      service.start();
      const active = makeVideo('v0', 'p0', { readingOrderIndex: 0 });
      service.register(active);

      const noOrder = makeVideo('vn', 'pn'); // readingOrderIndex -1
      const ordered = makeVideo('vo', 'po', { readingOrderIndex: 3 });
      service.register(noOrder);
      service.register(ordered);

      expect(service.getQueue()).toEqual(['po', 'pn']);
    });

    it('never queues non-sequenced (hover/click) videos', () => {
      service.start();
      const hover = makeVideo('vh', 'ph', { sequenced: false });
      service.register(hover);
      expect(service.getQueue()).toEqual([]);
      expect(service.getActivePanelId()).toBeNull();
      expect(hover.activate).not.toHaveBeenCalled();
    });
  });

  describe('pass-completion advance', () => {
    it('advances to the next slot on pass completion without deactivating the finished video (loop keeps playing)', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      const v2 = makeVideo('v2', 'p2', { readingOrderIndex: 1 });
      service.register(v1);
      service.register(v2);

      service.notifyPassComplete('v1');

      // v1 was NOT deactivated — a loop-mode video keeps looping muted.
      expect(v1.deactivate).not.toHaveBeenCalled();
      expect(v2.activate).toHaveBeenCalled();
      expect(service.getActivePanelId()).toBe('p2');
    });

    it('ignores pass completions from non-active videos', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      const v2 = makeVideo('v2', 'p2', { readingOrderIndex: 1 });
      service.register(v1);
      service.register(v2);

      service.notifyPassComplete('v2'); // not active
      expect(service.getActivePanelId()).toBe('p1');
      expect(v2.activate).not.toHaveBeenCalled();
    });

    it('emits queueComplete when the last slot finishes its pass', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      service.register(v1);
      expect(queueCompletions).toBe(0);
      service.notifyPassComplete('v1');
      expect(queueCompletions).toBe(1);
    });
  });

  describe('multiple videos in one panel (one slot, §7)', () => {
    it('starts all of a panel’s videos together and completes on the longest pass', () => {
      service.start();
      const a = makeVideo('va', 'p1', { readingOrderIndex: 0 });
      const b = makeVideo('vb', 'p1', { readingOrderIndex: 0 });
      const next = makeVideo('vn', 'p2', { readingOrderIndex: 1 });
      service.register(a);
      service.register(b);
      service.register(next);

      // One queue slot for p1; both videos started.
      expect(a.activate).toHaveBeenCalled();
      expect(b.activate).toHaveBeenCalled();
      expect(service.getQueue()).toEqual(['p2']);

      // First (shorter) video finishing does not advance the slot.
      service.notifyPassComplete('va');
      expect(next.activate).not.toHaveBeenCalled();

      // Slot completes when the longest pass completes.
      service.notifyPassComplete('vb');
      expect(next.activate).toHaveBeenCalled();
    });

    it('starts a late-registering video of the active slot immediately', () => {
      service.start();
      const a = makeVideo('va', 'p1', { readingOrderIndex: 0 });
      service.register(a);
      expect(service.getActivePanelId()).toBe('p1');

      const b = makeVideo('vb', 'p1', { readingOrderIndex: 0 });
      service.register(b);
      expect(b.activate).toHaveBeenCalled();

      // The slot now waits for both passes.
      service.notifyPassComplete('va');
      expect(service.getActivePanelId()).toBe('p1');
      service.notifyPassComplete('vb');
      expect(queueCompletions).toBe(1);
    });
  });

  describe('visibility changes (§4.2/§4.3.3)', () => {
    beforeEach(() => {
      supported = true; // IntersectionObserver drives visibility
    });

    it('waits for visibility before queueing and appends when a video becomes visible', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      service.register(v1);

      // Not visible yet → nothing queued/playing.
      expect(service.getQueue()).toEqual([]);
      expect(v1.activate).not.toHaveBeenCalled();

      changes$.next({ id: 'p1', visible: true });
      expect(v1.activate).toHaveBeenCalled();
    });

    it('pauses and resets a video whose panel leaves the viewport', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      const v2 = makeVideo('v2', 'p2', { readingOrderIndex: 1 });
      service.register(v1);
      service.register(v2);
      changes$.next({ id: 'p1', visible: true });
      changes$.next({ id: 'p2', visible: true });
      expect(service.getActivePanelId()).toBe('p1');

      // Active panel scrolls out: deactivated (pause+reset) and next plays.
      changes$.next({ id: 'p1', visible: false });
      expect(v1.deactivate).toHaveBeenCalled();
      expect(v2.activate).toHaveBeenCalled();

      // Queued (non-active) panel scrolls out: removed silently.
      changes$.next({ id: 'p2', visible: false });
      expect(v2.deactivate).toHaveBeenCalled();
    });

    it('suspends (pause, keep position) hover/click videos leaving the viewport', () => {
      service.start();
      const suspendSpy = jasmine.createSpy('suspend');
      const hover = makeVideo('vh', 'ph', {
        sequenced: false,
        suspend: suspendSpy,
      });
      service.register(hover);

      changes$.next({ id: 'ph', visible: false });
      expect(suspendSpy).toHaveBeenCalled();
      // Never deactivated (that would reset the position, §4.2 keeps it).
      expect(hover.deactivate).not.toHaveBeenCalled();
    });

    it('re-queues a panel that becomes visible again', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      service.register(v1);
      changes$.next({ id: 'p1', visible: true });
      changes$.next({ id: 'p1', visible: false });
      v1.activate.calls.reset();

      changes$.next({ id: 'p1', visible: true });
      expect(v1.activate).toHaveBeenCalled();
    });
  });

  describe('stall-skip (§7)', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('skips a stalled slot after the timeout and emits the skip hook', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      const v2 = makeVideo('v2', 'p2', { readingOrderIndex: 1 });
      service.register(v1);
      service.register(v2);

      jasmine.clock().tick(DEFAULT_STALL_TIMEOUT_MS + 1);

      expect(v1.onStallSkip).toHaveBeenCalled();
      expect(v1.deactivate).toHaveBeenCalled();
      expect(v2.activate).toHaveBeenCalled();
    });

    it('does not skip while the video reports progress', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      service.register(v1);

      // Report progress just before the timeout, twice.
      jasmine.clock().tick(DEFAULT_STALL_TIMEOUT_MS - 100);
      service.notifyProgress('v1');
      jasmine.clock().tick(DEFAULT_STALL_TIMEOUT_MS - 100);
      service.notifyProgress('v1');
      jasmine.clock().tick(DEFAULT_STALL_TIMEOUT_MS - 100);

      expect(v1.onStallSkip).not.toHaveBeenCalled();

      // Silence for the full timeout → skip.
      jasmine.clock().tick(200);
      expect(v1.onStallSkip).toHaveBeenCalled();
    });

    it('uses a configurable timeout', () => {
      service.setStallTimeout(500);
      expect(service.getStallTimeout()).toBe(500);
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      service.register(v1);
      jasmine.clock().tick(501);
      expect(v1.onStallSkip).toHaveBeenCalled();
    });

    it('rejects invalid stall timeouts', () => {
      service.setStallTimeout(-1);
      expect(service.getStallTimeout()).toBe(DEFAULT_STALL_TIMEOUT_MS);
      service.setStallTimeout(NaN);
      expect(service.getStallTimeout()).toBe(DEFAULT_STALL_TIMEOUT_MS);
    });
  });

  describe('pause / resume (unmuted user video, §4.3.4)', () => {
    it('deactivates the active slot on pause and replays it on resume', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      const v2 = makeVideo('v2', 'p2', { readingOrderIndex: 1 });
      service.register(v1);
      service.register(v2);
      expect(service.getActivePanelId()).toBe('p1');

      service.pause();
      expect(service.isPaused()).toBeTrue();
      expect(v1.deactivate).toHaveBeenCalled();
      expect(service.getActivePanelId()).toBeNull();
      // Paused slot is queued at the front for the resume.
      expect(service.getQueue()).toEqual(['p1', 'p2']);

      v1.activate.calls.reset();
      service.resume();
      expect(service.isPaused()).toBeFalse();
      expect(v1.activate).toHaveBeenCalled();
      expect(service.getActivePanelId()).toBe('p1');
    });

    it('does not start new slots while paused', () => {
      service.start();
      service.pause();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      service.register(v1);
      expect(v1.activate).not.toHaveBeenCalled();

      service.resume();
      expect(v1.activate).toHaveBeenCalled();
    });

    it('does not emit queueComplete while paused', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      service.register(v1);
      service.pause();
      // Active was re-queued; complete cannot fire while paused.
      expect(queueCompletions).toBe(0);
    });
  });

  describe('lifecycle', () => {
    it('unregistering the last pending video of the active slot advances the queue', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      const v2 = makeVideo('v2', 'p2', { readingOrderIndex: 1 });
      service.register(v1);
      service.register(v2);

      service.unregister('v1'); // destroyed mid-play
      expect(v2.activate).toHaveBeenCalled();
    });

    it('reset deactivates registered videos and clears the queue', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      const v2 = makeVideo('v2', 'p2', { readingOrderIndex: 1 });
      service.register(v1);
      service.register(v2);

      service.reset();
      expect(service.isRunning()).toBeFalse();
      expect(service.getQueue()).toEqual([]);
      expect(v1.deactivate).toHaveBeenCalled();
      expect(v2.deactivate).toHaveBeenCalled();
    });

    it('start() re-enlists still-registered videos (page change with reused components)', () => {
      service.start();
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      service.register(v1);
      expect(v1.activate).toHaveBeenCalled();

      v1.activate.calls.reset();
      service.start(); // restart for a "new page"
      expect(v1.activate).toHaveBeenCalled();
    });

    it('does nothing when not running', () => {
      const v1 = makeVideo('v1', 'p1', { readingOrderIndex: 0 });
      service.register(v1); // no start()
      expect(v1.activate).not.toHaveBeenCalled();
      expect(service.getQueue()).toEqual([]);
    });
  });
});
