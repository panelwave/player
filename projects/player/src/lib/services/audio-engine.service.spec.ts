/**
 * Audio Engine Service Tests
 */

import { TestBed } from '@angular/core/testing';
import { AudioEngineService, AudioTrack } from './audio-engine.service';

describe('AudioEngineService', () => {
  let service: AudioEngineService;
  let mockAudioContext: any;
  let mockGainNode: any;
  let mockAudio: any;

  beforeEach(() => {
    // Mock GainNode
    mockGainNode = {
      gain: {
        value: 1,
        setValueAtTime: jasmine.createSpy('setValueAtTime'),
        linearRampToValueAtTime: jasmine.createSpy('linearRampToValueAtTime'),
      },
      connect: jasmine.createSpy('connect'),
      disconnect: jasmine.createSpy('disconnect'),
    };

    // Mock AudioContext
    mockAudioContext = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createGain: jasmine.createSpy('createGain').and.returnValue(mockGainNode),
      createMediaElementSource: jasmine.createSpy('createMediaElementSource').and.returnValue({
        connect: jasmine.createSpy('connect'),
        disconnect: jasmine.createSpy('disconnect'),
      }),
      resume: jasmine.createSpy('resume').and.returnValue(Promise.resolve()),
      close: jasmine.createSpy('close').and.returnValue(Promise.resolve()),
    };

    // Mock Audio constructor
    mockAudio = {
      play: jasmine.createSpy('play').and.returnValue(Promise.resolve()),
      pause: jasmine.createSpy('pause'),
      load: jasmine.createSpy('load'),
      volume: 1,
      currentTime: 0,
      duration: 100,
      paused: false,
      loop: false,
      src: '',
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
    };

    // Mock window.Audio
    spyOn(window as any, 'Audio').and.returnValue(mockAudio);

    // Mock AudioContext constructor
    (window as any).AudioContext = jasmine.createSpy('AudioContext').and.returnValue(mockAudioContext);

    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioEngineService);
  });

  afterEach(() => {
    service.destroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initialize', () => {
    it('should create audio context and gain nodes', async () => {
      await service.initialize();

      expect((window as any).AudioContext).toHaveBeenCalled();
      expect(mockAudioContext.createGain).toHaveBeenCalledTimes(5); // 1 master + 4 roles
    });

    it('should not reinitialize if already initialized', async () => {
      await service.initialize();
      const calls = (mockAudioContext.createGain as jasmine.Spy).calls.count();

      await service.initialize();

      expect((mockAudioContext.createGain as jasmine.Spy).calls.count()).toBe(calls);
    });
  });

  describe('play', () => {
    const mockTrack: AudioTrack = {
      id: 'test-audio',
      url: 'test.mp3',
      role: 'music',
      loop: false,
      volume: 0.8,
    };

    it('should play audio track', async () => {
      await service.play(mockTrack);

      expect((window as any).Audio).toHaveBeenCalledWith(mockTrack.url);
      expect(mockAudio.play).toHaveBeenCalled();
    });

    it('should set loop property', async () => {
      const loopingTrack = { ...mockTrack, loop: true };
      await service.play(loopingTrack);

      expect(mockAudio.loop).toBe(true);
    });

    it('should stop existing track with same ID', async () => {
      await service.play(mockTrack);
      const firstAudio = mockAudio;

      // Create new mock for second play
      const secondMockAudio = { ...mockAudio };
      (window as any).Audio.and.returnValue(secondMockAudio);

      await service.play(mockTrack);

      expect(firstAudio.pause).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    const mockTrack: AudioTrack = {
      id: 'test-audio',
      url: 'test.mp3',
      role: 'sfx',
    };

    it('should stop playing audio', async () => {
      await service.play(mockTrack);
      await service.stop(mockTrack.id);

      expect(mockAudio.pause).toHaveBeenCalled();
      expect(mockAudio.currentTime).toBe(0);
    });

    it('should handle stopping non-existent track', async () => {
      // Should not throw
      await service.stop('non-existent');
      expect(true).toBe(true);
    });
  });

  describe('pause', () => {
    const mockTrack: AudioTrack = {
      id: 'test-audio',
      url: 'test.mp3',
      role: 'ambient',
    };

    it('should pause playing audio', async () => {
      await service.play(mockTrack);
      service.pause(mockTrack.id);

      expect(mockAudio.pause).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    const mockTrack: AudioTrack = {
      id: 'test-audio',
      url: 'test.mp3',
      role: 'voiceover',
    };

    it('should resume paused audio', async () => {
      await service.play(mockTrack);
      mockAudio.paused = true;

      await service.resume(mockTrack.id);

      expect(mockAudio.play).toHaveBeenCalled();
    });
  });

  describe('setMasterVolume', () => {
    it('should set master volume', async () => {
      await service.initialize();

      service.setMasterVolume(0.5);

      expect(service.getMasterVolume()).toBe(0.5);
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.5, mockAudioContext.currentTime);
    });

    it('should clamp volume between 0 and 1', async () => {
      await service.initialize();

      service.setMasterVolume(1.5);
      expect(service.getMasterVolume()).toBe(1);

      service.setMasterVolume(-0.5);
      expect(service.getMasterVolume()).toBe(0);
    });
  });

  describe('setRoleVolume', () => {
    it('should set role volume', async () => {
      await service.initialize();

      service.setRoleVolume('music', 0.7);

      expect(service.getRoleVolume('music')).toBe(0.7);
    });

    it('should clamp volume between 0 and 1', async () => {
      await service.initialize();

      service.setRoleVolume('sfx', 2.0);
      expect(service.getRoleVolume('sfx')).toBe(1);

      service.setRoleVolume('sfx', -1.0);
      expect(service.getRoleVolume('sfx')).toBe(0);
    });
  });

  describe('getActiveTracks', () => {
    it('should return active track IDs', async () => {
      const track1: AudioTrack = { id: 'track1', url: 'test1.mp3', role: 'music' };
      const track2: AudioTrack = { id: 'track2', url: 'test2.mp3', role: 'sfx' };

      await service.play(track1);
      
      // Create new mock for second track
      const secondMockAudio = { ...mockAudio };
      (window as any).Audio.and.returnValue(secondMockAudio);
      await service.play(track2);

      const active = service.getActiveTracks();

      expect(active.length).toBe(2);
      expect(active).toContain('track1');
      expect(active).toContain('track2');
    });
  });

  describe('stopAll', () => {
    it('should stop all active tracks', async () => {
      const track1: AudioTrack = { id: 'track1', url: 'test1.mp3', role: 'music' };
      const track2: AudioTrack = { id: 'track2', url: 'test2.mp3', role: 'ambient' };

      await service.play(track1);
      const firstAudio = mockAudio;

      const secondMockAudio = { ...mockAudio };
      (window as any).Audio.and.returnValue(secondMockAudio);
      await service.play(track2);

      await service.stopAll();

      expect(firstAudio.pause).toHaveBeenCalled();
      expect(secondMockAudio.pause).toHaveBeenCalled();
      expect(service.getActiveTracks().length).toBe(0);
    });
  });

  describe('resumeContext', () => {
    it('should resume suspended audio context', async () => {
      mockAudioContext.state = 'suspended';
      await service.initialize();

      await service.resumeContext();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('should initialize if not initialized', async () => {
      await service.resumeContext();

      expect((window as any).AudioContext).toHaveBeenCalled();
    });
  });

  describe('isAutoplayAllowed', () => {
    it('should return false initially', () => {
      expect(service.isAutoplayAllowed()).toBe(false);
    });

    it('should return true after successful initialization', async () => {
      mockAudioContext.state = 'running';
      await service.initialize();

      expect(service.isAutoplayAllowed()).toBe(true);
    });
  });

  describe('destroy', () => {
    it('should close audio context and cleanup', async () => {
      await service.initialize();
      const track: AudioTrack = { id: 'test', url: 'test.mp3', role: 'music' };
      await service.play(track);

      service.destroy();

      expect(mockAudioContext.close).toHaveBeenCalled();
      expect(service.getActiveTracks().length).toBe(0);
    });
  });

  describe('mute flags (toolbar Audio / SFX toggles)', () => {
    it('master mute drives the master gain to 0 and back without losing the volume', async () => {
      await service.initialize();
      service.setMasterVolume(0.6);

      service.setMasterMuted(true);
      expect(service.isMasterMuted()).toBe(true);
      expect(service.getMasterVolume()).toBe(0.6);
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0, mockAudioContext.currentTime);

      service.setMasterMuted(false);
      expect(service.isMasterMuted()).toBe(false);
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.6, mockAudioContext.currentTime);
    });

    it('emits masterMuted$ changes (distinct)', async () => {
      const seen: boolean[] = [];
      service.masterMuted$.subscribe((muted) => seen.push(muted));

      service.setMasterMuted(true);
      service.setMasterMuted(true);
      service.setMasterMuted(false);

      expect(seen).toEqual([false, true, false]);
    });

    it('role mute silences one bus and keeps its volume', async () => {
      await service.initialize();
      service.setRoleVolume('sfx', 0.4);

      service.setRoleMuted('sfx', true);
      expect(service.isRoleMuted('sfx')).toBe(true);
      expect(service.getRoleVolume('sfx')).toBe(0.4);
      expect(service.isRoleMuted('music')).toBe(false);
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0, mockAudioContext.currentTime);

      service.setRoleMuted('sfx', false);
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.4, mockAudioContext.currentTime);
    });

    it('mute flags set before initialization apply to the created gain nodes', async () => {
      service.setMasterMuted(true);
      service.setRoleMuted('sfx', true);

      await service.initialize();

      // The shared mock node ends up with the last written value (0).
      expect(mockGainNode.gain.value).toBe(0);
    });
  });

  describe('per-track gain', () => {
    it('creates a gain node per track and applies the track volume (0-2)', async () => {
      await service.initialize();
      const calls = mockAudioContext.createGain.calls.count();

      await service.play({ id: 't', url: 't.mp3', role: 'music', volume: 1.5 });

      expect(mockAudioContext.createGain.calls.count()).toBe(calls + 1);
      expect(mockGainNode.gain.value).toBe(1.5);
      expect(service.getPlaybackState('t')?.volume).toBe(1.5);
      expect(service.getPlaybackState('t')?.role).toBe('music');
    });

    it('setTrackVolume changes a playing track', async () => {
      await service.play({ id: 't', url: 't.mp3', role: 'ambient', volume: 0.5 });

      service.setTrackVolume('t', 0.9);

      expect(service.getPlaybackState('t')?.volume).toBe(0.9);
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.9, mockAudioContext.currentTime);
    });

    it('releases a one-shot track when it ends', async () => {
      await service.play({ id: 'shot', url: 'shot.mp3', role: 'sfx' });
      expect(service.isActive('shot')).toBe(true);
      const ended = mockAudio.addEventListener.calls
        .allArgs()
        .find((args: unknown[]) => args[0] === 'ended')?.[1] as () => void;
      expect(ended).toBeDefined();

      ended();

      expect(service.isActive('shot')).toBe(false);
    });

    it('does not attach an ended handler to looping tracks', async () => {
      await service.play({ id: 'loop', url: 'loop.mp3', role: 'ambient', loop: true });

      expect(mockAudio.addEventListener).not.toHaveBeenCalled();
    });
  });
});
