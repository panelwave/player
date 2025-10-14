/**
 * Character Sheet Modal Component
 * Displays detailed character information
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { LocaleCode, LocalizedString } from '../../../types';

/**
 * Character definition (same as in CharacterRosterComponent)
 */
export interface Character {
  id: string;
  name: LocalizedString;
  avatar?: string;
  bio?: LocalizedString;
  voiceSample?: string;
  role?: string;
}

/**
 * Character Sheet Modal Component
 * Modal for displaying detailed character information
 */
@Component({
  selector: 'pw-character-sheet',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './character-sheet.component.html',
  styleUrls: ['./character-sheet.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterSheetComponent {
  /**
   * Character to display
   */
  @Input() character?: Character;

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Base URL for assets
   */
  @Input() baseUrl = '';

  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Close modal
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Audio element for voice sample
   */
  private audioElement?: HTMLAudioElement;

  /**
   * Voice sample playing state
   */
  isPlaying = false;

  /**
   * Get localized string
   */
  getLocalizedString(text?: LocalizedString): string {
    if (!text || typeof text !== 'object') {
      return '';
    }

    // Try exact locale
    if (text[this.locale]) {
      return text[this.locale];
    }

    // Try base language
    const baseLocale = this.locale.split('-')[0];
    const baseMatch = Object.keys(text).find((key) => key.startsWith(baseLocale));
    if (baseMatch && text[baseMatch]) {
      return text[baseMatch];
    }

    // Return first available
    const firstKey = Object.keys(text)[0];
    return firstKey ? text[firstKey] : '';
  }

  /**
   * Get character name
   */
  getCharacterName(): string {
    if (!this.character) return '';
    return this.getLocalizedString(this.character.name) || this.character.id;
  }

  /**
   * Get character bio
   */
  getCharacterBio(): string {
    if (!this.character) return '';
    return this.getLocalizedString(this.character.bio) || '';
  }

  /**
   * Get portrait URL
   */
  getPortraitUrl(): string {
    if (!this.character?.avatar) {
      return '';
    }

    // Absolute URL
    if (
      this.character.avatar.startsWith('http://') ||
      this.character.avatar.startsWith('https://') ||
      this.character.avatar.startsWith('data:')
    ) {
      return this.character.avatar;
    }

    // Relative URL
    return this.baseUrl + this.character.avatar;
  }

  /**
   * Get voice sample URL
   */
  getVoiceSampleUrl(): string {
    if (!this.character?.voiceSample) {
      return '';
    }

    // Absolute URL
    if (
      this.character.voiceSample.startsWith('http://') ||
      this.character.voiceSample.startsWith('https://') ||
      this.character.voiceSample.startsWith('data:')
    ) {
      return this.character.voiceSample;
    }

    // Relative URL
    return this.baseUrl + this.character.voiceSample;
  }

  /**
   * Check if character has voice sample
   */
  hasVoiceSample(): boolean {
    return !!this.character?.voiceSample;
  }

  /**
   * Play voice sample
   */
  playVoiceSample(): void {
    const url = this.getVoiceSampleUrl();
    if (!url) return;

    if (this.isPlaying) {
      this.stopVoiceSample();
      return;
    }

    // Create audio element if not exists
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.addEventListener('ended', () => {
        this.isPlaying = false;
      });
      this.audioElement.addEventListener('error', () => {
        this.isPlaying = false;
        console.error('Failed to load voice sample');
      });
    }

    this.audioElement.src = url;
    this.audioElement.play()
      .then(() => {
        this.isPlaying = true;
      })
      .catch((error) => {
        console.error('Failed to play voice sample:', error);
        this.isPlaying = false;
      });
  }

  /**
   * Stop voice sample
   */
  stopVoiceSample(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.isPlaying = false;
    }
  }

  /**
   * Close modal
   */
  onClose(): void {
    this.stopVoiceSample();
    this.close.emit();
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  /**
   * Handle backdrop keyboard interaction
   */
  onBackdropKeydown(event: KeyboardEvent): void {
    if (event.target === event.currentTarget && 
        (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.onClose();
    }
  }

  /**
   * Handle keyboard events
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    if (!this.visible) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.onClose();
    }
  }

  /**
   * Get character initials for fallback
   */
  getInitials(): string {
    const name = this.getCharacterName();
    const words = name.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Cleanup on destroy
   */
  ngOnDestroy(): void {
    this.stopVoiceSample();
    if (this.audioElement) {
      this.audioElement.remove();
    }
  }
}
