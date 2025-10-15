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
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './character-roster.component.html',
  styleUrls: ['./character-roster.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterRosterComponent implements OnInit, OnChanges {
  /**
   * List of characters
   */
  @Input() characters: Character[] = [];

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
   * Character selected
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
   * Get avatar URL
   */
  getAvatarUrl(character: Character): string {
    if (!character.avatar) {
      return '';
    }

    // Absolute URL
    if (
      character.avatar.startsWith('http://') ||
      character.avatar.startsWith('https://') ||
      character.avatar.startsWith('data:')
    ) {
      return character.avatar;
    }

    // Relative URL
    return this.baseUrl + character.avatar;
  }

  /**
   * Select character
   */
  selectCharacter(character: Character): void {
    this.characterSelect.emit(character);
  }

  /**
   * Close roster
   */
  onClose(): void {
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

  /**
   * Get character initials for fallback
   */
  getInitials(character: Character): string {
    const name = this.getCharacterName(character);
    const words = name.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
}
