/**
 * Video Controller Service Tests
 */

import { TestBed } from '@angular/core/testing';
import { VideoControllerService, VideoEvent } from './video-controller.service';

describe('VideoControllerService', () => {
  let service: VideoControllerService;
  let mockVideo: HTMLVideoElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VideoControllerService);

    // Create mock video element
    mockVideo = document.createElement('video');
    mockVideo.src = 'test.mp4';
    
    // Mock play/pause methods
    spyOn(mockVideo, 'play').and.returnValue(Promise.resolve());
    spyOn(mockVideo, 'pause');
    spyOn(mockVideo, 'load');
  });

  afterEach(() => {
    service.destroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('play', () => {
    it('should play video', async () => {
      await service.play(mockVideo, 'test-video');

      expect(mockVideo.play).toHaveBeenCalled();
      expect(service.getActiveVideoId()).toBe('test-video');
      expect(service.getState()).toBe('playing');
    });

    it('should stop previous video when playing new one', async () => {
      const firstVideo = document.createElement('video');
      firstVideo.src = 'first.mp4';
      spyOn(firstVideo, 'play').and.returnValue(Promise.resolve());
      spyOn(firstVideo, 'pause');

      await service.play(firstVideo, 'video-1');
      expect(service.getActiveVideoId()).toBe('video-1');

      await service.play(mockVideo, 'video-2');
      
      expect(firstVideo.pause).toHaveBeenCalled();
      expect(service.getActiveVideoId()).toBe('video-2');
    });

    it('should emit play event', async () => {
      const events: VideoEvent[] = [];
      service.events$.subscribe(event => events.push(event));

      await service.play(mockVideo, 'test-video');

      const playEvent = events.find(e => e.type === 'play');
      expect(playEvent).toBeDefined();
      expect(playEvent?.videoId).toBe('test-video');
    });

    it('should handle play errors', async () => {
      (mockVideo.play as jasmine.Spy).and.returnValue(Promise.reject(new Error('Play failed')));

      await expectAsync(service.play(mockVideo, 'test-video')).toBeRejected();
      expect(service.getState()).toBe('error');
    });
  });

  describe('one-unmuted-video rule', () => {
    let secondVideo: HTMLVideoElement;

    beforeEach(() => {
      secondVideo = document.createElement('video');
      secondVideo.src = 'second.mp4';
      spyOn(secondVideo, 'play').and.returnValue(Promise.resolve());
      spyOn(secondVideo, 'pause');
    });

    it('pauses another unmuted video when a new unmuted one plays', async () => {
      await service.play(mockVideo, 'unmuted-1', false);
      await service.play(secondVideo, 'unmuted-2', false);

      expect(mockVideo.pause).toHaveBeenCalled();
    });

    it('does NOT pause a muted video when an unmuted one plays', async () => {
      await service.play(mockVideo, 'muted-1', true);
      await service.play(secondVideo, 'unmuted-2', false);

      expect(mockVideo.pause).not.toHaveBeenCalled();
    });

    it('lets multiple muted videos play concurrently', async () => {
      await service.play(mockVideo, 'muted-1', true);
      await service.play(secondVideo, 'muted-2', true);

      expect(mockVideo.pause).not.toHaveBeenCalled();
      expect(secondVideo.play).toHaveBeenCalled();
    });

    it('pauses others when a muted video is flipped to unmuted', async () => {
      await service.play(mockVideo, 'unmuted-1', false);
      await service.play(secondVideo, 'muted-2', true);
      // mockVideo not paused yet (second was muted)
      expect(mockVideo.pause).not.toHaveBeenCalled();

      service.notifyMutedChanged('muted-2', false);
      expect(mockVideo.pause).toHaveBeenCalled();
    });

    it('notifies the preempted video via its registered onPreempted callback', async () => {
      const onPreempted = jasmine.createSpy('onPreempted');
      await service.play(mockVideo, 'unmuted-1', false, onPreempted);

      await service.play(secondVideo, 'unmuted-2', false);

      expect(mockVideo.pause).toHaveBeenCalled();
      expect(onPreempted).toHaveBeenCalledTimes(1);
    });

    it('does not notify the video that stays active', async () => {
      const onPreempted = jasmine.createSpy('onPreempted');
      await service.play(mockVideo, 'unmuted-1', false);
      await service.play(secondVideo, 'unmuted-2', false, onPreempted);

      // secondVideo is the newly-started, still-playing one.
      expect(onPreempted).not.toHaveBeenCalled();
    });

    it('clears the active video pointer when the active video is preempted', async () => {
      await service.play(mockVideo, 'unmuted-1', false);
      expect(service.getActiveVideoId()).toBe('unmuted-1');

      await service.play(secondVideo, 'unmuted-2', false);

      // The preempted video must not be left dangling as "active".
      expect(service.getActiveVideoId()).toBe('unmuted-2');
    });

    it('notifies preempted videos through notifyMutedChanged as well', async () => {
      const onPreempted = jasmine.createSpy('onPreempted');
      await service.play(mockVideo, 'unmuted-1', false, onPreempted);
      await service.play(secondVideo, 'muted-2', true);

      service.notifyMutedChanged('muted-2', false);

      expect(onPreempted).toHaveBeenCalledTimes(1);
    });
  });

  describe('pause', () => {
    it('should pause playing video', async () => {
      await service.play(mockVideo, 'test-video');
      
      service.pause();

      expect(mockVideo.pause).toHaveBeenCalled();
      expect(service.getState()).toBe('paused');
    });

    it('should emit pause event', async () => {
      const events: VideoEvent[] = [];
      service.events$.subscribe(event => events.push(event));

      await service.play(mockVideo, 'test-video');
      service.pause();

      const pauseEvent = events.find(e => e.type === 'pause');
      expect(pauseEvent).toBeDefined();
      expect(pauseEvent?.videoId).toBe('test-video');
    });

    it('should not pause if no video playing', () => {
      service.pause();
      expect(mockVideo.pause).not.toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('should resume paused video', async () => {
      await service.play(mockVideo, 'test-video');
      service.pause();

      await service.resume();

      expect(mockVideo.play).toHaveBeenCalledTimes(2); // Once for play, once for resume
      expect(service.getState()).toBe('playing');
    });

    it('should not resume if not paused', async () => {
      const playCount = (mockVideo.play as jasmine.Spy).calls.count();
      
      await service.resume();

      expect((mockVideo.play as jasmine.Spy).calls.count()).toBe(playCount);
    });
  });

  describe('stop', () => {
    it('should stop playing video', async () => {
      await service.play(mockVideo, 'test-video');
      
      await service.stop();

      expect(mockVideo.pause).toHaveBeenCalled();
      expect(mockVideo.currentTime).toBe(0);
      expect(service.getActiveVideoId()).toBeUndefined();
      expect(service.getState()).toBe('idle');
    });

    it('should emit stop event', async () => {
      const events: VideoEvent[] = [];
      service.events$.subscribe(event => events.push(event));

      await service.play(mockVideo, 'test-video');
      await service.stop();

      const stopEvent = events.find(e => e.type === 'stop');
      expect(stopEvent).toBeDefined();
      expect(stopEvent?.videoId).toBe('test-video');
    });
  });

  describe('getStatus', () => {
    it('should return video status', async () => {
      mockVideo.currentTime = 10;
      Object.defineProperty(mockVideo, 'duration', { value: 100, configurable: true });
      mockVideo.volume = 0.8;
      mockVideo.muted = false;

      await service.play(mockVideo, 'test-video');
      
      const status = service.getStatus();

      expect(status).toBeDefined();
      expect(status?.videoId).toBe('test-video');
      expect(status?.state).toBe('playing');
      expect(status?.currentTime).toBe(10);
      expect(status?.duration).toBe(100);
      expect(status?.volume).toBe(0.8);
      expect(status?.muted).toBe(false);
    });

    it('should return undefined if no active video', () => {
      const status = service.getStatus();
      expect(status).toBeUndefined();
    });
  });

  describe('isPlaying', () => {
    it('should return true when playing', async () => {
      await service.play(mockVideo, 'test-video');
      expect(service.isPlaying()).toBe(true);
    });

    it('should return false when paused', async () => {
      await service.play(mockVideo, 'test-video');
      service.pause();
      expect(service.isPlaying()).toBe(false);
    });

    it('should return false when idle', () => {
      expect(service.isPlaying()).toBe(false);
    });
  });

  describe('setVolume', () => {
    it('should set video volume', async () => {
      await service.play(mockVideo, 'test-video');
      
      service.setVolume(0.5);

      expect(mockVideo.volume).toBe(0.5);
    });

    it('should clamp volume between 0 and 1', async () => {
      await service.play(mockVideo, 'test-video');

      service.setVolume(1.5);
      expect(mockVideo.volume).toBe(1);

      service.setVolume(-0.5);
      expect(mockVideo.volume).toBe(0);
    });

    it('should not throw if no active video', () => {
      expect(() => service.setVolume(0.5)).not.toThrow();
    });
  });

  describe('setMuted', () => {
    it('should mute video', async () => {
      await service.play(mockVideo, 'test-video');
      
      service.setMuted(true);

      expect(mockVideo.muted).toBe(true);
    });

    it('should unmute video', async () => {
      await service.play(mockVideo, 'test-video');
      mockVideo.muted = true;
      
      service.setMuted(false);

      expect(mockVideo.muted).toBe(false);
    });
  });

  describe('seek', () => {
    it('should seek to time', async () => {
      Object.defineProperty(mockVideo, 'duration', { value: 100, configurable: true });
      await service.play(mockVideo, 'test-video');
      
      service.seek(50);

      expect(mockVideo.currentTime).toBe(50);
    });

    it('should clamp seek time to duration', async () => {
      Object.defineProperty(mockVideo, 'duration', { value: 100, configurable: true });
      await service.play(mockVideo, 'test-video');

      service.seek(150);
      expect(mockVideo.currentTime).toBe(100);

      service.seek(-10);
      expect(mockVideo.currentTime).toBe(0);
    });
  });

  describe('event handling', () => {
    it('should emit ended event', async () => {
      const events: VideoEvent[] = [];
      service.events$.subscribe(event => events.push(event));

      await service.play(mockVideo, 'test-video');

      // Simulate ended event
      const endedEvent = new Event('ended');
      mockVideo.dispatchEvent(endedEvent);

      const ended = events.find(e => e.type === 'ended');
      expect(ended).toBeDefined();
      expect(service.getState()).toBe('idle');
    });

    it('keeps a looping video registered (and preemptable) across its internal `ended` cycle boundary', async () => {
      // Simulates VideoLayerComponent's loop mode: it does NOT call
      // unregister() on `ended` (only 'once' mode / pause / stop / destroy
      // do), so the video must stay in the registry when it keeps playing
      // past a native `ended` event.
      const onPreempted = jasmine.createSpy('onPreempted');
      await service.play(mockVideo, 'loop-video', false, onPreempted);

      mockVideo.dispatchEvent(new Event('ended'));

      const secondVideo = document.createElement('video');
      spyOn(secondVideo, 'play').and.returnValue(Promise.resolve());
      await service.play(secondVideo, 'unmuted-2', false);

      // Still registered -> still subject to the single-unmuted-video rule
      // and still notified of preemption.
      expect(mockVideo.pause).toHaveBeenCalled();
      expect(onPreempted).toHaveBeenCalledTimes(1);
    });

    it('does not double-register a looping video across repeated internal `ended` cycles', async () => {
      const onPreempted = jasmine.createSpy('onPreempted');
      await service.play(mockVideo, 'loop-video', false, onPreempted);

      mockVideo.dispatchEvent(new Event('ended'));
      mockVideo.dispatchEvent(new Event('ended'));
      mockVideo.dispatchEvent(new Event('ended'));

      const secondVideo = document.createElement('video');
      spyOn(secondVideo, 'play').and.returnValue(Promise.resolve());
      await service.play(secondVideo, 'unmuted-2', false);

      // Exactly one preemption notification, regardless of how many internal
      // `ended` cycles occurred beforehand.
      expect(onPreempted).toHaveBeenCalledTimes(1);
      expect(mockVideo.pause).toHaveBeenCalledTimes(1);
    });

    it('lets the owning component clean up a genuinely finished ("once") video via unregister()', async () => {
      const onPreempted = jasmine.createSpy('onPreempted');
      await service.play(mockVideo, 'once-video', false, onPreempted);

      // `ended` fires, then the owning component (once mode) unregisters it.
      mockVideo.dispatchEvent(new Event('ended'));
      service.unregister('once-video');

      const secondVideo = document.createElement('video');
      spyOn(secondVideo, 'play').and.returnValue(Promise.resolve());
      await service.play(secondVideo, 'unmuted-2', false);

      // No longer registered -> not paused, not notified.
      expect(mockVideo.pause).not.toHaveBeenCalled();
      expect(onPreempted).not.toHaveBeenCalled();
    });

    it('should emit buffering event', async () => {
      const events: VideoEvent[] = [];
      service.events$.subscribe(event => events.push(event));

      await service.play(mockVideo, 'test-video');
      
      // Simulate waiting event
      const waitingEvent = new Event('waiting');
      mockVideo.dispatchEvent(waitingEvent);

      const buffering = events.find(e => e.type === 'buffering');
      expect(buffering).toBeDefined();
      expect(service.getState()).toBe('buffering');
    });
  });

  describe('error recovery', () => {
    it('should retry on error', async () => {
      await service.play(mockVideo, 'test-video');
      
      // Simulate error
      const errorEvent = new Event('error');
      Object.defineProperty(mockVideo, 'error', {
        value: { code: MediaError.MEDIA_ERR_NETWORK },
        configurable: true
      });
      
      // Clear previous load calls
      (mockVideo.load as jasmine.Spy).calls.reset();
      
      mockVideo.dispatchEvent(errorEvent);

      // Wait for retry attempt
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockVideo.load).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should cleanup resources', async () => {
      await service.play(mockVideo, 'test-video');

      service.destroy();

      expect(service.getActiveVideoId()).toBeUndefined();
      expect(service.getState()).toBe('idle');
    });
  });
});
