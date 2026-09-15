/**
 * Audio Engine Service
 * Manages audio playback with Web Audio API
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import type { SequenceAudioTrack } from '../types';

/**
 * Audio role/bus type
 */
export type AudioRole = 'ambient' | 'music' | 'voiceover' | 'sfx';

/**
 * Audio track definition
 */
export interface AudioTrack {
  id: string;
  url: string;
  role: AudioRole;
  loop?: boolean;
  /** Per-track gain (0-2; 1 = as authored). */
  volume?: number;
  fadeIn?: number; // milliseconds
  fadeOut?: number; // milliseconds
}

/**
 * Playback state
 */
export interface PlaybackState {
  id: string;
  role: AudioRole;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

/**
 * Per-track bookkeeping: the element, its source node, its own gain node
 * (between source and bus, so fades and per-track gain never touch the bus)
 * and the bus it plays on.
 */
interface ActiveTrack {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  role: AudioRole;
  volume: number;
  onEnded?: () => void;
}

const ROLES: AudioRole[] = ['ambient', 'music', 'voiceover', 'sfx'];

/**
 * Audio Engine Service
 * Provides Web Audio API-based audio playback with multiple buses.
 *
 * Signal chain: element -> track gain -> role gain -> master gain -> output.
 * Volumes and mutes are independent: a bus keeps its volume while muted and
 * comes back at that volume when unmuted (the toolbar's Audio/SFX toggles
 * drive the mute flags; the settings' volumes drive the gains).
 */
@Injectable({
  providedIn: 'root',
})
export class AudioEngineService {
  /**
   * Audio context
   */
  private audioContext?: AudioContext;

  /**
   * Master gain node
   */
  private masterGain?: GainNode;

  /**
   * Gain nodes for each role
   */
  private roleGains = new Map<AudioRole, GainNode>();

  /**
   * Active tracks by id
   */
  private tracks = new Map<string, ActiveTrack>();

  /**
   * Master volume (0-1)
   */
  private _masterVolume = 1.0;

  /**
   * Role volumes (0-1)
   */
  private roleVolumes = new Map<AudioRole, number>([
    ['ambient', 1.0],
    ['music', 1.0],
    ['voiceover', 1.0],
    ['sfx', 1.0],
  ]);

  /** Master mute flag (independent of the master volume). */
  private readonly masterMutedSubject = new BehaviorSubject<boolean>(false);

  /** Muted buses (independent of their volumes). */
  private mutedRoles = new Set<AudioRole>();

  /**
   * Master mute state. Video layers follow this too, so the toolbar's Audio
   * toggle silences the whole player, not only the WebAudio buses.
   */
  readonly masterMuted$: Observable<boolean> = this.masterMutedSubject
    .asObservable()
    .pipe(distinctUntilChanged());

  /**
   * Autoplay allowed flag
   */
  private autoplayAllowed = false;

  /**
   * Initialize audio context and gain nodes
   */
  async initialize(): Promise<void> {
    if (this.audioContext) {
      return; // Already initialized
    }

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Create master gain
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = this.effectiveMasterGain();

      // Create gain nodes for each role
      ROLES.forEach((role) => {
        const gain = this.audioContext!.createGain();
        gain.connect(this.masterGain!);
        gain.gain.value = this.effectiveRoleGain(role);
        this.roleGains.set(role, gain);
      });

      // Test autoplay policy
      await this.testAutoplayPolicy();
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      throw error;
    }
  }

  /**
   * Test autoplay policy
   */
  private async testAutoplayPolicy(): Promise<void> {
    if (!this.audioContext) return;

    try {
      // Try to resume context
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      this.autoplayAllowed = this.audioContext.state === 'running';
    } catch (error) {
      console.warn('Autoplay not allowed:', error);
      this.autoplayAllowed = false;
    }
  }

  /**
   * Resume audio context (call on user interaction)
   */
  async resumeContext(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
      return;
    }

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        this.autoplayAllowed = true;
      } catch (error) {
        console.error('Failed to resume audio context:', error);
      }
    }
  }

  /**
   * Play audio track
   */
  async play(track: AudioTrack): Promise<void> {
    await this.startTrack(track, 0);
  }

  /**
   * Stop audio track
   */
  async stop(id: string, fadeOutMs?: number): Promise<void> {
    const active = this.tracks.get(id);
    if (!active) return;

    // Apply fade out if specified
    if (fadeOutMs && fadeOutMs > 0) {
      await this.fadeOut(id, fadeOutMs);
      // A newer track may have replaced this id while fading.
      if (this.tracks.get(id) !== active) {
        return;
      }
    }

    // Stop playback
    active.audio.pause();
    active.audio.currentTime = 0;

    // Cleanup
    this.cleanup(id);
  }

  /**
   * Pause audio track
   */
  pause(id: string): void {
    const audio = this.tracks.get(id)?.audio;
    if (audio && !audio.paused) {
      audio.pause();
    }
  }

  /**
   * Resume audio track
   */
  async resume(id: string): Promise<void> {
    const audio = this.tracks.get(id)?.audio;
    if (audio && audio.paused) {
      await audio.play();
    }
  }

  /**
   * Fade in audio
   */
  private fadeIn(id: string, durationMs: number, targetVolume: number): Promise<void> {
    return new Promise((resolve) => {
      const gainNode = this.getTrackGainNode(id);
      if (!gainNode || !this.audioContext) {
        resolve();
        return;
      }

      const currentTime = this.audioContext.currentTime;
      gainNode.gain.setValueAtTime(0, currentTime);
      gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + durationMs / 1000);

      setTimeout(resolve, durationMs);
    });
  }

  /**
   * Fade out audio
   */
  private fadeOut(id: string, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const gainNode = this.getTrackGainNode(id);
      if (!gainNode || !this.audioContext) {
        resolve();
        return;
      }

      const currentTime = this.audioContext.currentTime;
      const currentGain = gainNode.gain.value;
      gainNode.gain.setValueAtTime(currentGain, currentTime);
      gainNode.gain.linearRampToValueAtTime(0, currentTime + durationMs / 1000);

      setTimeout(resolve, durationMs);
    });
  }

  /**
   * Get the per-track gain node (sits between the element and its bus).
   */
  private getTrackGainNode(id: string): GainNode | undefined {
    return this.tracks.get(id)?.gain;
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this._masterVolume = Math.max(0, Math.min(1, volume));
    this.applyMasterGain();
  }

  /**
   * Get master volume
   */
  getMasterVolume(): number {
    return this._masterVolume;
  }

  /**
   * Mute/unmute everything without touching the master volume.
   */
  setMasterMuted(muted: boolean): void {
    if (this.masterMutedSubject.value === muted) {
      return;
    }
    this.masterMutedSubject.next(muted);
    this.applyMasterGain();
  }

  /**
   * Whether the master output is muted.
   */
  isMasterMuted(): boolean {
    return this.masterMutedSubject.value;
  }

  /**
   * Set role volume
   */
  setRoleVolume(role: AudioRole, volume: number): void {
    const normalizedVolume = Math.max(0, Math.min(1, volume));
    this.roleVolumes.set(role, normalizedVolume);
    this.applyRoleGain(role);
  }

  /**
   * Get role volume
   */
  getRoleVolume(role: AudioRole): number {
    return this.roleVolumes.get(role) ?? 1.0;
  }

  /**
   * Mute/unmute one bus without touching its volume.
   */
  setRoleMuted(role: AudioRole, muted: boolean): void {
    if (muted) {
      this.mutedRoles.add(role);
    } else {
      this.mutedRoles.delete(role);
    }
    this.applyRoleGain(role);
  }

  /**
   * Whether a bus is muted.
   */
  isRoleMuted(role: AudioRole): boolean {
    return this.mutedRoles.has(role);
  }

  /**
   * Change the per-track gain (0-2) of a playing track.
   */
  setTrackVolume(id: string, volume: number): void {
    const active = this.tracks.get(id);
    if (!active) return;
    active.volume = this.clampTrackVolume(volume);
    if (this.audioContext) {
      active.gain.gain.setValueAtTime(active.volume, this.audioContext.currentTime);
    } else {
      active.gain.gain.value = active.volume;
    }
  }

  /**
   * Get playback state
   */
  getPlaybackState(id: string): PlaybackState | undefined {
    const active = this.tracks.get(id);
    if (!active) return undefined;

    return {
      id,
      role: active.role,
      playing: !active.audio.paused,
      currentTime: active.audio.currentTime,
      duration: active.audio.duration,
      volume: active.volume,
    };
  }

  /**
   * Get all active tracks
   */
  getActiveTracks(): string[] {
    return Array.from(this.tracks.keys());
  }

  /**
   * Whether a track with this id is currently registered (playing or paused).
   */
  isActive(id: string): boolean {
    return this.tracks.has(id);
  }

  /**
   * Stop all audio
   */
  async stopAll(fadeOutMs?: number): Promise<void> {
    const ids = this.getActiveTracks();
    await Promise.all(ids.map((id) => this.stop(id, fadeOutMs)));
  }

  /**
   * Cleanup track resources
   */
  private cleanup(id: string): void {
    const active = this.tracks.get(id);
    if (!active) return;
    this.tracks.delete(id);

    if (active.onEnded && typeof active.audio.removeEventListener === 'function') {
      active.audio.removeEventListener('ended', active.onEnded);
    }
    active.source.disconnect();
    active.gain.disconnect();
    active.audio.src = '';
    active.audio.load();
  }

  /**
   * Check if autoplay is allowed
   */
  isAutoplayAllowed(): boolean {
    return this.autoplayAllowed;
  }

  /**
   * Play sequence audio tracks for a chapter based on playback time
   * @param tracks Array of sequence audio tracks from chapter
   * @param currentTimeMs Current playback time in milliseconds
   * @param assetBaseUrl Base URL for resolving asset URLs
   */
  async playSequenceTracks(
    tracks: SequenceAudioTrack[],
    currentTimeMs: number,
    assetBaseUrl = ''
  ): Promise<void> {
    // Ensure initialized
    if (!this.audioContext) {
      await this.initialize();
    }

    // Resume if needed
    if (this.audioContext!.state === 'suspended') {
      await this.resumeContext();
    }

    // Play tracks that should be playing at current time
    for (const track of tracks) {
      // Skip muted tracks
      if (track.muted) continue;

      const trackStartMs = track.startTime;
      const trackEndMs = trackStartMs + track.duration;

      // Check if track should be playing at current time
      if (currentTimeMs >= trackStartMs && currentTimeMs < trackEndMs) {
        // Calculate offset within the track
        const offsetMs = currentTimeMs - trackStartMs;
        const offsetSeconds = offsetMs / 1000;

        // Construct asset URL
        const audioUrl = assetBaseUrl + track.assetId;

        // Create audio track definition
        const audioTrack: AudioTrack = {
          id: track.id,
          url: audioUrl,
          role: track.role,
          loop: track.loop,
          volume: track.volume !== undefined && isFinite(track.volume)
            ? Math.max(0, Math.min(2, track.volume))
            : 1.0,
          fadeIn: track.fadeIn,
          fadeOut: track.fadeOut,
        };

        try {
          // Play track from offset
          await this.startTrack(audioTrack, offsetSeconds);
        } catch (error) {
          console.error(`Failed to play sequence track ${track.id}:`, error);
        }
      }
    }
  }

  /**
   * Create the element + node chain for a track and start it (optionally
   * from an offset). Replaces any active track with the same id.
   */
  private async startTrack(track: AudioTrack, offsetSeconds: number): Promise<void> {
    // Ensure initialized
    if (!this.audioContext) {
      await this.initialize();
    }

    // Resume if needed
    if (this.audioContext!.state === 'suspended') {
      await this.resumeContext();
    }

    // Stop existing track with same ID
    if (this.tracks.has(track.id)) {
      await this.stop(track.id);
    }

    const bus = this.roleGains.get(track.role);
    if (!bus) {
      throw new Error(`Invalid role: ${track.role}`);
    }

    // Create audio element
    const audio = new Audio(track.url);
    audio.loop = track.loop || false;
    if (offsetSeconds > 0) {
      audio.currentTime = offsetSeconds;
    }

    // Element -> track gain -> bus
    const source = this.audioContext!.createMediaElementSource(audio);
    const gain = this.audioContext!.createGain();
    const volume = this.clampTrackVolume(track.volume);
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(bus);

    const active: ActiveTrack = { audio, source, gain, role: track.role, volume };
    this.tracks.set(track.id, active);

    // One-shot tracks release their resources when they finish.
    if (!audio.loop && typeof audio.addEventListener === 'function') {
      active.onEnded = () => {
        if (this.tracks.get(track.id) === active) {
          this.cleanup(track.id);
        }
      };
      audio.addEventListener('ended', active.onEnded);
    }

    try {
      // Apply fade in (shortened when starting mid-fade)
      if (track.fadeIn && track.fadeIn > 0 && offsetSeconds * 1000 < track.fadeIn) {
        await this.fadeIn(track.id, track.fadeIn - offsetSeconds * 1000, volume);
      }

      // Play audio
      await audio.play();
    } catch (error) {
      console.error(`Failed to play audio ${track.id}:`, error);
      // Cleanup on error
      this.cleanup(track.id);
      throw error;
    }
  }

  /**
   * Stop sequence audio tracks
   * @param trackIds Array of track IDs to stop (optional, stops all if not provided)
   */
  async stopSequenceTracks(trackIds?: string[]): Promise<void> {
    if (trackIds) {
      await Promise.all(trackIds.map((id) => this.stop(id)));
    } else {
      await this.stopAll();
    }
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    // Stop all audio
    this.stopAll();

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }

    // Clear references
    this.roleGains.clear();
    this.tracks.clear();
    this.audioContext = undefined;
    this.masterGain = undefined;
    this.autoplayAllowed = false;
  }

  private clampTrackVolume(volume: number | undefined): number {
    if (volume === undefined || !isFinite(volume)) {
      return 1.0;
    }
    return Math.max(0, Math.min(2, volume));
  }

  private effectiveMasterGain(): number {
    return this.masterMutedSubject.value ? 0 : this._masterVolume;
  }

  private effectiveRoleGain(role: AudioRole): number {
    return this.mutedRoles.has(role) ? 0 : this.getRoleVolume(role);
  }

  private applyMasterGain(): void {
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setValueAtTime(this.effectiveMasterGain(), this.audioContext.currentTime);
    }
  }

  private applyRoleGain(role: AudioRole): void {
    const gainNode = this.roleGains.get(role);
    if (gainNode && this.audioContext) {
      gainNode.gain.setValueAtTime(this.effectiveRoleGain(role), this.audioContext.currentTime);
    }
  }
}
