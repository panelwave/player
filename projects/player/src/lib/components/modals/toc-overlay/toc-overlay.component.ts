/**
 * Table of Contents Overlay Component
 * Displays chapter and panel navigation
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Chapter, Panel, LocaleCode, LocalizedString } from '../../../types';

/**
 * ToC navigation target
 */
export interface TocNavigationTarget {
  chapterId: string;
  panelId?: string;
}

/**
 * Table of Contents Overlay Component
 * Modal overlay for chapter/panel navigation
 */
@Component({
  selector: 'pw-toc-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './toc-overlay.component.html',
  styleUrls: ['./toc-overlay.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TocOverlayComponent implements OnInit {
  /**
   * List of chapters
   */
  @Input() chapters: Chapter[] = [];

  /**
   * Current chapter ID
   */
  @Input() currentChapterId?: string;

  /**
   * Current panel ID
   */
  @Input() currentPanelId?: string;

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Navigate to chapter/panel
   */
  @Output() navigate = new EventEmitter<TocNavigationTarget>();

  /**
   * Close overlay
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Search query
   */
  searchQuery = '';

  /**
   * Selected chapter index
   */
  selectedChapterIndex = 0;

  /**
   * Filtered chapters
   */
  filteredChapters: Chapter[] = [];

  /**
   * Initialize component
   */
  ngOnInit(): void {
    this.filterChapters();
    this.selectCurrentChapter();
  }

  /**
   * Filter chapters based on search query
   */
  filterChapters(): void {
    if (!this.searchQuery.trim()) {
      this.filteredChapters = [...this.chapters];
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.filteredChapters = this.chapters.filter((chapter) => {
      const title = this.getLocalizedString(chapter.title);
      return title.toLowerCase().includes(query);
    });
  }

  /**
   * Select current chapter
   */
  selectCurrentChapter(): void {
    if (!this.currentChapterId) return;

    const index = this.filteredChapters.findIndex(
      (ch) => ch.id === this.currentChapterId
    );
    if (index >= 0) {
      this.selectedChapterIndex = index;
    }
  }

  /**
   * Handle search input
   */
  onSearchChange(): void {
    this.filterChapters();
    this.selectedChapterIndex = 0;
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
   * Get chapter title
   */
  getChapterTitle(chapter: Chapter): string {
    return this.getLocalizedString(chapter.title) || chapter.id;
  }

  /**
   * Get panels for chapter
   */
  getPanels(chapter: Chapter): Panel[] {
    if (!chapter.panels) return [];
    return Object.values(chapter.panels);
  }

  /**
   * Navigate to chapter
   */
  navigateToChapter(chapter: Chapter): void {
    this.navigate.emit({ chapterId: chapter.id });
  }

  /**
   * Navigate to panel
   */
  navigateToPanel(chapter: Chapter, panel: Panel): void {
    this.navigate.emit({
      chapterId: chapter.id,
      panelId: panel.id,
    });
  }

  /**
   * Check if chapter is current
   */
  isCurrentChapter(chapter: Chapter): boolean {
    return chapter.id === this.currentChapterId;
  }

  /**
   * Check if panel is current
   */
  isCurrentPanel(panel: Panel): boolean {
    return panel.id === this.currentPanelId;
  }

  /**
   * Select chapter
   */
  selectChapter(index: number): void {
    this.selectedChapterIndex = index;
  }

  /**
   * Close overlay
   */
  onClose(): void {
    this.close.emit();
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    // Close if clicking directly on backdrop
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  /**
   * Handle keyboard events
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    if (!this.visible) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.onClose();
        break;

      case 'ArrowDown':
        event.preventDefault();
        this.selectChapter(
          Math.min(this.selectedChapterIndex + 1, this.filteredChapters.length - 1)
        );
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.selectChapter(Math.max(this.selectedChapterIndex - 1, 0));
        break;

      case 'Enter':
        event.preventDefault();
        if (this.filteredChapters[this.selectedChapterIndex]) {
          this.navigateToChapter(this.filteredChapters[this.selectedChapterIndex]);
        }
        break;
    }
  }

  /**
   * Get selected chapter
   */
  getSelectedChapter(): Chapter | undefined {
    return this.filteredChapters[this.selectedChapterIndex];
  }
}
