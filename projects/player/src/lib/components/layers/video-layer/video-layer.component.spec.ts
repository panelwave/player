/**
 * Video Layer Component Tests
 * Covers play modes, start modes, autoplay policy, and reduced-motion.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VideoLayerComponent } from './video-layer.component';
import { VideoControllerService } from '../../../services/video-controller.service';
import { UserGestureService } from '../../../services/user-gesture.service';

/** Minimal controllable stand-in for the gesture service. */
class MockGestureService {
  private interacted = false;
  hasInteracted(): boolean {
    return this.interacted;
  }
  markInteracted(): void {
    this.interacted = true;
  }
  set(value: boolean): void {
    this.interacted = value;
  }
}

describe('VideoLayerComponent', () => {
  let fixture: ComponentFixture<VideoLayerComponent>;
  let component: VideoLayerComponent;
  let gesture: MockGestureService;
  let controller: VideoControllerService;
  let videoEl: HTMLVideoElement;

  /** Configure the mock <video> element with duration and spied methods. */
  function setupVideoElement(duration = 10): void {
    videoEl = component.videoElement!.nativeElement;
    Object.defineProperty(videoEl, 'duration', {
      value: duration,
      configurable: true,
    });
    // Make currentTime writable (jsdom/Chrome allow this but guard anyway).
    spyOn(videoEl, 'play').and.returnValue(Promise.resolve());
    spyOn(videoEl, 'pause');
  }

  /** Simulate the native `ended` media event. */
  function fireEnded(): void {
    videoEl.dispatchEvent(new Event('ended'));
  }

  /** Simulate the native `loadedmetadata` media event (e.g. after a src swap). */
  function fireLoadedMetadata(): void {
    videoEl.dispatchEvent(new Event('loadedmetadata'));
  }

  beforeEach(async () => {
    gesture = new MockGestureService();
    await TestBed.configureTestingModule({
      imports: [VideoLayerComponent],
      providers: [
        VideoControllerService,
        { provide: UserGestureService, useValue: gesture },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoLayerComponent);
    component = fixture.componentInstance;
    controller = TestBed.inject(VideoControllerService);
    component.videoId = 'test-vid';
    component.src = 'clip.mp4';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('URL resolution', () => {
    it('prepends baseUrl to relative sources', () => {
      component.baseUrl = 'https://cdn/';
      component.src = 'clip.mp4';
      expect(component.getVideoUrl()).toBe('https://cdn/clip.mp4');
    });

    it('leaves absolute URLs untouched', () => {
      component.src = 'https://x/clip.mp4';
      expect(component.getVideoUrl()).toBe('https://x/clip.mp4');
    });
  });

  describe('play mode: once', () => {
    it('freezes on the last frame (no rewind) on ended', () => {
      component.playMode = 'once';
      component.startAtMs = 0;
      component.onLoadedMetadata();
      setupVideoElement(10);
      videoEl.currentTime = 10;

      const passSpy = jasmine.createSpy('pass');
      const endSpy = jasmine.createSpy('end');
      component.passComplete.subscribe(passSpy);
      component.videoEnd.subscribe(endSpy);

      fireEnded();

      expect(videoEl.currentTime).toBe(10); // not reset to start
      expect(videoEl.play).not.toHaveBeenCalled();
      expect(passSpy).toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalledTimes(1); // once mode: the video is finished
    });
  });

  describe('play mode: loop', () => {
    it('seeks back to startAtMs and replays on ended', () => {
      component.playMode = 'loop';
      component.startAtMs = 2000;
      component.onLoadedMetadata();
      setupVideoElement(10);
      videoEl.currentTime = 10;

      const endSpy = jasmine.createSpy('end');
      component.videoEnd.subscribe(endSpy);

      fireEnded();

      expect(videoEl.currentTime).toBe(2); // 2000ms
      expect(videoEl.play).toHaveBeenCalled();
      // loop restarts internally on `ended`; that's not "finished".
      expect(endSpy).not.toHaveBeenCalled();
    });
  });

  describe('play mode: loop-from', () => {
    it('seeks to loopFromMs on ended', () => {
      component.playMode = 'loop-from';
      component.startAtMs = 0;
      component.loopFromMs = 3000;
      component.onLoadedMetadata();
      setupVideoElement(10);
      videoEl.currentTime = 10;

      fireEnded();

      expect(videoEl.currentTime).toBe(3);
      expect(videoEl.play).toHaveBeenCalled();
    });

    it('clamps an out-of-range loopFromMs to startAtMs', () => {
      component.playMode = 'loop-from';
      component.startAtMs = 1000;
      component.loopFromMs = 99000; // >= duration
      component.onLoadedMetadata();
      setupVideoElement(10);
      videoEl.currentTime = 10;

      fireEnded();

      expect(videoEl.currentTime).toBe(1); // clamped to startAtMs
    });
  });

  describe('play mode: pingpong', () => {
    it('degrades to loop for streaming assets (warns once)', () => {
      const warnSpy = spyOn(console, 'warn');
      component.playMode = 'pingpong';
      component.streaming = true;
      component.startAtMs = 0;
      component.onLoadedMetadata();
      setupVideoElement(10);
      videoEl.currentTime = 10;

      void component.play();
      fireEnded();

      // Behaves like loop (seek back + replay), not reverse.
      expect(videoEl.currentTime).toBe(0);
      expect(videoEl.play).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('swaps to the reverse variant for the backward pass', () => {
      component.playMode = 'pingpong';
      component.reverseSrc = 'clip-rev.mp4';
      component.baseUrl = 'https://cdn/';
      component.startAtMs = 0;
      component.onLoadedMetadata();
      setupVideoElement(10);

      void component.play();
      fireEnded();

      expect(videoEl.src).toContain('clip-rev.mp4');
      expect(videoEl.muted).toBe(true); // muted during reverse phase
    });

    describe('reverse-swap race (deferred seek/play + guarded re-init)', () => {
      beforeEach(() => {
        component.playMode = 'pingpong';
        component.reverseSrc = 'clip-rev.mp4';
        component.baseUrl = 'https://cdn/';
        component.startAtMs = 0;
        component.onLoadedMetadata();
        setupVideoElement(10);
      });

      it('does not seek/play the reverse variant until its loadedmetadata fires', () => {
        videoEl.currentTime = 10;
        void component.play(); // starts the forward pass (1 play() call)
        (videoEl.play as jasmine.Spy).calls.reset();

        fireEnded(); // forward pass ends -> starts reverse pass, swaps src

        expect(videoEl.src).toContain('clip-rev.mp4');
        // currentTime must be untouched (still 10) until loadedmetadata.
        expect(videoEl.currentTime).toBe(10);
        // play() must not be (re-)invoked for the reverse variant yet.
        expect((videoEl.play as jasmine.Spy).calls.count()).toBe(0);

        fireLoadedMetadata();

        expect(videoEl.currentTime).toBe(0);
        expect(videoEl.play).toHaveBeenCalled();
      });

      it('does not re-run initial setup (listener re-attach / autoplay) when the swap loadedmetadata fires', () => {
        const attachSpy = spyOn(
          component as unknown as { attachMediaListeners(): void },
          'attachMediaListeners'
        ).and.callThrough();
        void component.play();
        fireEnded();
        attachSpy.calls.reset();

        fireLoadedMetadata(); // reverse-variant swap's own loadedmetadata

        expect(attachSpy).not.toHaveBeenCalled();
      });

      it('defers the forward-swap-back seek/play until its own loadedmetadata (finishReversePass)', () => {
        void component.play();
        fireEnded(); // -> reverse pass begins, src swapped to reverse
        fireLoadedMetadata(); // reverse variant ready, playing reverse

        (videoEl.play as jasmine.Spy).calls.reset();
        videoEl.currentTime = 7; // mid-reverse-playback position

        // Reverse variant finishes -> finishReversePass() swaps back to forward.
        videoEl.dispatchEvent(new Event('ended'));

        expect(videoEl.src).not.toContain('clip-rev.mp4');
        // Must not have jumped to start yet -- waiting for loadedmetadata.
        expect(videoEl.currentTime).toBe(7);
        expect((videoEl.play as jasmine.Spy).calls.count()).toBe(0);

        fireLoadedMetadata(); // forward variant ready again

        expect(videoEl.currentTime).toBe(0); // startAtMs
        expect(videoEl.play).toHaveBeenCalled();
      });
    });

    describe('pingpong cycle emission contract', () => {
      beforeEach(() => {
        component.playMode = 'pingpong';
        component.reverseSrc = 'clip-rev.mp4';
        component.baseUrl = 'https://cdn/';
        component.startAtMs = 0;
        component.onLoadedMetadata();
        setupVideoElement(10);
      });

      it('emits exactly one videoLoop and one passComplete per completed cycle, and no videoEnd at internal boundaries (reverse-variant path)', () => {
        const loopSpy = jasmine.createSpy('loop');
        const passSpy = jasmine.createSpy('pass');
        const endSpy = jasmine.createSpy('end');
        component.videoLoop.subscribe(loopSpy);
        component.passComplete.subscribe(passSpy);
        component.videoEnd.subscribe(endSpy);

        void component.play();
        fireEnded(); // forward pass ends -> reverse pass starts
        fireLoadedMetadata(); // reverse variant playable

        // Cycle is not complete yet: forward pass end is an internal boundary.
        expect(loopSpy).not.toHaveBeenCalled();
        expect(passSpy).not.toHaveBeenCalled();
        expect(endSpy).not.toHaveBeenCalled();

        videoEl.dispatchEvent(new Event('ended')); // reverse variant ends -> cycle complete
        fireLoadedMetadata(); // forward variant swapped back in, ready

        expect(loopSpy).toHaveBeenCalledTimes(1);
        expect(passSpy).toHaveBeenCalledTimes(1);
        expect(endSpy).not.toHaveBeenCalled();
      });

      it('emits exactly one videoLoop and one passComplete per completed cycle for the frame-stepping fallback (no reverse variant)', () => {
        component.reverseSrc = ''; // forces the frame-stepping fallback path

        const loopSpy = jasmine.createSpy('loop');
        const passSpy = jasmine.createSpy('pass');
        const endSpy = jasmine.createSpy('end');
        component.videoLoop.subscribe(loopSpy);
        component.passComplete.subscribe(passSpy);
        component.videoEnd.subscribe(endSpy);

        void component.play();
        videoEl.currentTime = 10;
        fireEnded(); // forward pass ends -> frame-stepping backward begins

        expect(loopSpy).not.toHaveBeenCalled();
        expect(passSpy).not.toHaveBeenCalled();

        // Drive currentTime to the start offset and invoke the private
        // finishReversePass() directly to simulate the frame-stepping tick
        // loop reaching startAtMs (avoids depending on rAF/timer internals).
        videoEl.currentTime = 0;
        (component as unknown as { finishReversePass(): void }).finishReversePass();

        expect(loopSpy).toHaveBeenCalledTimes(1);
        expect(passSpy).toHaveBeenCalledTimes(1);
        expect(endSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('start mode: on-view', () => {
    it('plays when viewActive becomes true', () => {
      component.startMode = 'on-view';
      component.reducedMotion = false;
      component.onLoadedMetadata();
      setupVideoElement(10);
      const playSpy = spyOn(component, 'play').and.returnValue(Promise.resolve());

      component.viewActive = true;
      component.ngOnChanges({
        viewActive: {
          currentValue: true,
          previousValue: false,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(playSpy).toHaveBeenCalled();
    });

    it('resets to start when viewActive becomes false', () => {
      component.startMode = 'on-view';
      component.reducedMotion = false;
      component.startAtMs = 1000;
      component.onLoadedMetadata();
      setupVideoElement(10);
      videoEl.currentTime = 5;

      component.viewActive = false;
      component.ngOnChanges({
        viewActive: {
          currentValue: false,
          previousValue: true,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(videoEl.pause).toHaveBeenCalled();
      expect(videoEl.currentTime).toBe(1); // reset to startAtMs
    });
  });

  describe('start mode: on-click', () => {
    it('toggles play/pause on click', async () => {
      component.startMode = 'on-click';
      component.onLoadedMetadata();
      setupVideoElement(10);
      const playSpy = spyOn(component, 'play').and.returnValue(Promise.resolve());

      Object.defineProperty(videoEl, 'paused', { value: true, configurable: true });
      component.onClick();
      expect(playSpy).toHaveBeenCalled();
    });

    it('responds to Enter/Space keydown', () => {
      component.startMode = 'on-click';
      component.onLoadedMetadata();
      setupVideoElement(10);
      const playSpy = spyOn(component, 'play').and.returnValue(Promise.resolve());
      Object.defineProperty(videoEl, 'paused', { value: true, configurable: true });

      component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(playSpy).toHaveBeenCalled();
    });

    it('is keyboard interactive', () => {
      component.startMode = 'on-click';
      expect(component.isKeyboardInteractive()).toBe(true);
    });
  });

  describe('start mode: on-hover', () => {
    it('plays on mouseenter and pauses (keeping position) on mouseleave in page view', () => {
      component.startMode = 'on-hover';
      component.viewMode = 'page';
      // Force a non-touch environment (headless Chrome reports touch points).
      spyOn(component as unknown as { isTouchDevice(): boolean }, 'isTouchDevice').and.returnValue(false);
      component.onLoadedMetadata();
      setupVideoElement(10);
      const playSpy = spyOn(component, 'play').and.returnValue(Promise.resolve());
      videoEl.currentTime = 4;

      component.onMouseEnter();
      expect(playSpy).toHaveBeenCalled();

      component.onMouseLeave();
      expect(videoEl.pause).toHaveBeenCalled();
      expect(videoEl.currentTime).toBe(4); // position kept
    });

    it('falls back to on-click in panel view', () => {
      component.startMode = 'on-hover';
      component.viewMode = 'panel';
      expect(component.effectiveStartMode()).toBe('on-click');
    });
  });

  describe('autoplay policy', () => {
    it('forces muted when no gesture yet even if muted:false, shows affordance', async () => {
      gesture.set(false);
      component.startMode = 'on-view';
      component.muted = false;
      component.playMode = 'loop';
      component.onLoadedMetadata();
      setupVideoElement(10);

      await component.play();

      expect(videoEl.muted).toBe(true);
      expect(component.showUnmuteButton).toBe(true);
    });

    it('plays unmuted when a gesture has occurred', async () => {
      gesture.set(true);
      component.muted = false;
      component.onLoadedMetadata();
      setupVideoElement(10);

      await component.play();

      expect(videoEl.muted).toBe(false);
      expect(component.showUnmuteButton).toBe(false);
    });

    it('unmute affordance unmutes and records a gesture', async () => {
      gesture.set(false);
      component.muted = false;
      component.onLoadedMetadata();
      setupVideoElement(10);
      await component.play();
      expect(component.showUnmuteButton).toBe(true);

      component.onUnmuteClick(new MouseEvent('click'));

      expect(gesture.hasInteracted()).toBe(true);
      expect(videoEl.muted).toBe(false);
      expect(component.showUnmuteButton).toBe(false);
    });
  });

  describe('reduced motion', () => {
    it('degrades on-view to on-click', () => {
      component.startMode = 'on-view';
      component.reducedMotion = true;
      expect(component.effectiveStartMode()).toBe('on-click');
    });
  });

  describe('one-unmuted rule integration', () => {
    it('registers unmuted playback with the controller', async () => {
      gesture.set(true);
      component.muted = false;
      const ctrlSpy = spyOn(controller, 'play').and.returnValue(Promise.resolve());
      component.onLoadedMetadata();
      setupVideoElement(10);

      await component.play();

      expect(ctrlSpy).toHaveBeenCalledWith(
        jasmine.any(HTMLVideoElement),
        'test-vid',
        false,
        jasmine.any(Function)
      );
    });

    it('cancels frame-stepping and emits pause when preempted by another unmuted video', async () => {
      // Real controller (not spied) so pauseOtherUnmuted's preemption path runs.
      // Drives the reverse/frame-stepping phase directly (as other specs in
      // this file do for finishReversePass) rather than via a real `ended`
      // dispatch, to isolate the preemption contract from the play-mode
      // engine under test elsewhere.
      gesture.set(true);
      component.playMode = 'pingpong';
      component.reverseSrc = ''; // force the frame-stepping fallback path
      component.muted = false;
      component.onLoadedMetadata();
      setupVideoElement(10);

      const pauseSpy = jasmine.createSpy('pause');
      component.videoPause.subscribe(pauseSpy);

      await component.play();
      expect(controller.getActiveVideoId()).toBe('test-vid');

      videoEl.currentTime = 10;
      (component as unknown as { startReversePass(): void }).startReversePass();
      expect((component as unknown as { frameStepHandle: number | null }).frameStepHandle).not.toBeNull();

      const frameStepSpy = spyOn(
        component as unknown as { stopFrameStepping(): void },
        'stopFrameStepping'
      ).and.callThrough();

      // A second, independent unmuted video registration preempts this one.
      const otherVideo = document.createElement('video');
      spyOn(otherVideo, 'play').and.returnValue(Promise.resolve());
      await controller.play(otherVideo, 'other-video', false);

      expect(videoEl.pause).toHaveBeenCalled();
      expect(frameStepSpy).toHaveBeenCalled();
      expect((component as unknown as { frameStepHandle: number | null }).frameStepHandle).toBeNull();
      expect(component.showUnmuteButton).toBe(false);

      // The controller pausing the real element fires the native `pause`
      // event, which is what drives the `videoPause` output.
      videoEl.dispatchEvent(new Event('pause'));
      expect(pauseSpy).toHaveBeenCalled();
    });
  });
});
