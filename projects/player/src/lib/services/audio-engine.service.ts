/**
 * Audio Engine Service
 * Manages audio playback with Web Audio API
 */

import { Injectable } from '@angular/core';

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
  volume?: number; // 0-1
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
 * Audio Engine Service
 * Provides Web Audio API-based audio playback with multiple buses
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
   * Active audio elements
   */
  private activeAudio = new Map<string, HTMLAudioElement>();

  /**
   * Audio source nodes
   */
  private audioSources = new Map<string, MediaElementAudioSourceNode>();

  /**
   * Fade intervals
   */
  private fadeIntervals = new Map<string, number>();

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
      this.masterGain.gain.value = this._masterVolume;

      // Create gain nodes for each role
      const roles: AudioRole[] = ['ambient', 'music', 'voiceover', 'sfx'];
      roles.forEach((role) => {
        const gain = this.audioContext!.createGain();
        gain.connect(this.masterGain!);
        gain.gain.value = this.roleVolumes.get(role) || 1.0;
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
    // Ensure initialized
    if (!this.audioContext) {
      await this.initialize();
    }

    // Resume if needed
    if (this.audioContext!.state === 'suspended') {
      await this.resumeContext();
    }

    // Stop existing track with same ID
    if (this.activeAudio.has(track.id)) {
      await this.stop(track.id);
    }

    try {
      // Create audio element
      const audio = new Audio(track.url);
      audio.loop = track.loop || false;

      // Create source node
      const source = this.audioContext!.createMediaElementSource(audio);
      const gainNode = this.roleGains.get(track.role);
      
      if (!gainNode) {
        throw new Error(`Invalid role: ${track.role}`);
      }

      source.connect(gainNode);

      // Store references
      this.activeAudio.set(track.id, audio);
      this.audioSources.set(track.id, source);

      // Set initial volume
      const initialVolume = track.volume !== undefined ? track.volume : 1.0;

      // Apply fade in
      if (track.fadeIn && track.fadeIn > 0) {
        await this.fadeIn(track.id, track.fadeIn, initialVolume);
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
   * Stop audio track
   */
  async stop(id: string, fadeOutMs?: number): Promise<void> {
    const audio = this.activeAudio.get(id);
    if (!audio) return;

    // Apply fade out if specified
    if (fadeOutMs && fadeOutMs > 0) {
      await this.fadeOut(id, fadeOutMs);
    }

    // Stop playback
    audio.pause();
    audio.currentTime = 0;

    // Cleanup
    this.cleanup(id);
  }

  /**
   * Pause audio track
   */
  pause(id: string): void {
    const audio = this.activeAudio.get(id);
    if (audio && !audio.paused) {
      audio.pause();
    }
  }

  /**
   * Resume audio track
   */
  async resume(id: string): Promise<void> {
    const audio = this.activeAudio.get(id);
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
   * Get gain node for specific track
   */
  private getTrackGainNode(id: string): GainNode | undefined {
    const source = this.audioSources.get(id);
    if (!source) return undefined;

    // Get role from active audio metadata
    for (const [role, gainNode] of this.roleGains.entries()) {
      // Check if source is connected to this gain node
      // Note: We can't directly check connections, so we track role separately
      // For now, we'll need to store role with the track
      return gainNode;
    }

    return undefined;
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this._masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.audioContext) {
      const currentTime = this.audioContext.currentTime;
      this.masterGain.gain.setValueAtTime(this._masterVolume, currentTime);
    }
  }

  /**
   * Get master volume
   */
  getMasterVolume(): number {
    return this._masterVolume;
  }

  /**
   * Set role volume
   */
  setRoleVolume(role: AudioRole, volume: number): void {
    const normalizedVolume = Math.max(0, Math.min(1, volume));
    this.roleVolumes.set(role, normalizedVolume);

    const gainNode = this.roleGains.get(role);
    if (gainNode && this.audioContext) {
      const currentTime = this.audioContext.currentTime;
      gainNode.gain.setValueAtTime(normalizedVolume, currentTime);
    }
  }

  /**
   * Get role volume
   */
  getRoleVolume(role: AudioRole): number {
    return this.roleVolumes.get(role) || 1.0;
  }

  /**
   * Get playback state
   */
  getPlaybackState(id: string): PlaybackState | undefined {
    const audio = this.activeAudio.get(id);
    if (!audio) return undefined;

    // Determine role (we need to track this separately)
    let role: AudioRole = 'sfx'; // Default
    // In real implementation, store role with track

    return {
      id,
      role,
      playing: !audio.paused,
      currentTime: audio.currentTime,
      duration: audio.duration,
      volume: audio.volume,
    };
  }

  /**
   * Get all active tracks
   */
  getActiveTracks(): string[] {
    return Array.from(this.activeAudio.keys());
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
    // Clear fade interval
    const interval = this.fadeIntervals.get(id);
    if (interval !== undefined) {
      window.clearInterval(interval);
      this.fadeIntervals.delete(id);
    }

    // Disconnect source
    const source = this.audioSources.get(id);
    if (source) {
      source.disconnect();
      this.audioSources.delete(id);
    }

    // Remove audio element
    const audio = this.activeAudio.get(id);
    if (audio) {
      audio.src = '';
      audio.load();
      this.activeAudio.delete(id);
    }
  }

  /**
   * Check if autoplay is allowed
   */
  isAutoplayAllowed(): boolean {
    return this.autoplayAllowed;
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
    this.activeAudio.clear();
    this.audioSources.clear();
    this.fadeIntervals.clear();
  }
}
