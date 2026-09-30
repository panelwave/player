/**
 * Character Roster Component
 * Displays character grid with filtering
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
  inject,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { PwIconComponent } from '../../icon/pw-icon.component';
import { AssetUrlService } from '../../../services/asset-url.service';
import type { LocaleCode, LocalizedString } from '../../../types';

/**
 * Character definition
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
 * Character Roster Component
 * Modal for displaying and filtering characters
 */
@Component({
    selector: 'pw-character-roster',
    imports: [FormsModule, TranslatePipe, PwIconComponent],
    templateUrl: './character-roster.component.html',
    styleUrls: ['./character-roster.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CharacterRosterComponent implements OnInit, OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly assetUrl = inject(AssetUrlService);

  /**
   * Listeners attached to the current audio element (removed on stop)
   */
  private audioListeners: { ended: () => void; error: () => void } | null = null;

  /**
   * List of characters
   */
  @Input() characters: Character[] = [];

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Character selected (kept for backward compatibility but not used internally)
   */
  @Output() characterSelect = new EventEmitter<Character>();

  /**
   * Close overlay
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Search query
   */
  searchQuery = '';

  /**
   * Current view: 'list' or 'detail'
   */
  currentView: 'list' | 'detail' = 'list';

  /**
   * Selected character for detail view
   */
  selectedCharacter: Character | null = null;

  /**
   * Audio element for voice samples
   */
  private audioElement: HTMLAudioElement | null = null;

  /**
   * Is voice sample playing
   */
  isPlaying = false;

  /**
   * Filtered characters
   */
  filteredCharacters: Character[] = [];

  /**
   * Initialize component
   */
  ngOnInit(): void {
    this.filterCharacters();
  }

  /**
   * Handle input changes
   */
  ngOnChanges(): void {
    this.filterCharacters();
  }

  /**
   * Filter characters based on search query
   */
  filterCharacters(): void {
    if (!this.searchQuery.trim()) {
      this.filteredCharacters = [...this.characters];
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.filteredCharacters = this.characters.filter((character) => {
      const name = this.getLocalizedString(character.name);
      const role = character.role || '';
      return (
        name.toLowerCase().includes(query) ||
        role.toLowerCase().includes(query)
      );
    });
  }

  /**
   * Handle search input
   */
  onSearchChange(): void {
    this.filterCharacters();
  }

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
  getCharacterName(character: Character): string {
    return this.getLocalizedString(character.name) || character.id;
  }

  /**
   * Get character bio
   */
  getCharacterBio(character: Character): string {
    return this.getLocalizedString(character.bio) || '';
  }

  /**
   * Avatar URL: absolute as-is, relative via the manifest's assets.base / manifest URL.
   */
  getAvatarUrl(character: Character): string {
    return this.assetUrl.resolve(character.avatar, 'image');
  }

  /**
   * Select character - shows detail view
   */
  selectCharacter(character: Character): void {
    this.selectedCharacter = character;
    this.currentView = 'detail';
    this.searchQuery = ''; // Clear search when viewing detail
  }

  /**
   * Go back to character list
   */
  backToList(): void {
    this.currentView = 'list';
    this.selectedCharacter = null;
    this.stopVoiceSample();
  }

  /**
   * Close roster
   */
  onClose(): void {
    this.backToList(); // Reset view when closing
    this.close.emit();
  }

  /**
   * Get character initials for placeholder
   */
  getInitials(character: Character): string {
    const name = this.getCharacterName(character);
    const words = name.split(' ').filter(w => w.length > 0);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  /**
   * Check if character has voice sample
   */
  hasVoiceSample(character: Character): boolean {
    return !!character.voiceSample;
  }

  /**
   * Play or stop voice sample
   */
  playVoiceSample(character: Character): void {
    if (!character.voiceSample) return;

    if (this.isPlaying && this.audioElement) {
      this.stopVoiceSample();
    } else {
      this.startVoiceSample(character.voiceSample);
    }
  }

  /**
   * Start playing voice sample
   */
  private startVoiceSample(url: string): void {
    this.stopVoiceSample(); // Stop any existing audio

    const audioUrl = this.assetUrl.resolve(url, 'audio');

    const audio = new Audio(audioUrl);
    this.audioElement = audio;
    // All state changes below happen outside Angular's template events, so the
    // OnPush view must be marked for check explicitly.
    const listeners = {
      ended: () => this.setPlaying(false),
      error: () => {
        this.setPlaying(false);
        console.error('Failed to load voice sample');
      },
    };
    this.audioListeners = listeners;
    audio.addEventListener('ended', listeners.ended);
    audio.addEventListener('error', listeners.error);

    audio.play().then(() => {
      // Ignore a late resolution for an element that was already stopped/replaced
      if (this.audioElement === audio) {
        this.setPlaying(true);
      }
    }).catch((error) => {
      console.error('Failed to play voice sample:', error);
      if (this.audioElement === audio) {
        this.setPlaying(false);
      }
    });
  }

  /**
   * Update the playing flag and schedule an OnPush re-render
   */
  private setPlaying(playing: boolean): void {
    this.isPlaying = playing;
    this.cdr.markForCheck();
  }

  /**
   * Stop playing voice sample
   */
  private stopVoiceSample(): void {
    if (this.audioElement) {
      if (this.audioListeners) {
        this.audioElement.removeEventListener('ended', this.audioListeners.ended);
        this.audioElement.removeEventListener('error', this.audioListeners.error);
      }
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement = null;
    }
    this.audioListeners = null;
    this.isPlaying = false;
  }

  /**
   * Stop any playing voice sample when the component is destroyed
   */
  ngOnDestroy(): void {
    this.stopVoiceSample();
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
    // Only handle Enter/Space on the backdrop itself
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

}
