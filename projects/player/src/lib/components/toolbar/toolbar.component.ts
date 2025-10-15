/**
 * Toolbar Component
 * Bottom toolbar with all player controls
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { LocaleCode } from '../../types';

/**
 * Toolbar Component
 * Provides all player controls in a bottom toolbar
 */
@Component({
  selector: 'pw-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolbarComponent {
  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Available locales
   */
  @Input() availableLocales: LocaleCode[] = ['en-US'];

  /**
   * Current view mode
   */
  @Input() viewMode: 'page' | 'panel' = 'panel';

  /**
   * Page view available
   */
  @Input() pageViewAvailable = false;

  /**
   * Speech bubbles enabled
   */
  @Input() speechEnabled = true;

  /**
   * Audio enabled
   */
  @Input() audioEnabled = true;

  /**
   * SFX enabled
   */
  @Input() sfxEnabled = true;

  /**
   * Autoplay enabled
   */
  @Input() autoplayEnabled = false;

  /**
   * Seconds per panel (autoplay)
   */
  @Input() secondsPerPanel = 5;

  /**
   * Autoplay progress (0-100)
   */
  @Input() autoplayProgress = 0;

  /**
   * Thumbnails visible
   */
  @Input() thumbnailsVisible = false;

  /**
   * Has alternatives for current panel
   */
  @Input() hasAlternatives = false;

  /**
   * Has branch choices ahead
   */
  @Input() hasBranches = false;

  /**
   * Show social controls
   */
  @Input() showSocial = true;

  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Toggle page/panel view
   */
  @Output() toggleView = new EventEmitter<void>();

  /**
   * Locale changed
   */
  @Output() localeChange = new EventEmitter<LocaleCode>();

  /**
   * Toggle speech bubbles
   */
  @Output() toggleSpeech = new EventEmitter<void>();

  /**
   * Toggle audio
   */
  @Output() toggleAudio = new EventEmitter<void>();

  /**
   * Toggle SFX
   */
  @Output() toggleSfx = new EventEmitter<void>();

  /**
   * Toggle autoplay
   */
  @Output() toggleAutoplay = new EventEmitter<void>();

  /**
   * Seconds per panel changed
   */
  @Output() secondsPerPanelChange = new EventEmitter<number>();

  /**
   * Toggle thumbnails
   */
  @Output() toggleThumbnails = new EventEmitter<void>();

  /**
   * Open table of contents
   */
  @Output() openToc = new EventEmitter<void>();

  /**
   * Open settings
   */
  @Output() openSettings = new EventEmitter<void>();

  /**
   * Open characters
   */
  @Output() openCharacters = new EventEmitter<void>();

  /**
   * Cycle alternatives
   */
  @Output() cycleAlternative = new EventEmitter<void>();

  /**
   * Show branch choices
   */
  @Output() showBranches = new EventEmitter<void>();

  /**
   * Open extras
   */
  @Output() openExtras = new EventEmitter<void>();

  /**
   * Like action
   */
  @Output() like = new EventEmitter<void>();

  /**
   * Bookmark action
   */
  @Output() bookmark = new EventEmitter<void>();

  /**
   * Share action
   */
  @Output() share = new EventEmitter<void>();

  /**
   * Open comments
   */
  @Output() openComments = new EventEmitter<void>();

  /**
   * Close toolbar
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Show language dropdown
   */
  showLanguageDropdown = false;

  /**
   * Show autoplay controls
   */
  showAutoplayControls = false;

  /**
   * Handle view toggle
   */
  onToggleView(): void {
    if (this.pageViewAvailable) {
      this.toggleView.emit();
    }
  }

  /**
   * Handle locale selection
   */
  onSelectLocale(locale: LocaleCode): void {
    this.localeChange.emit(locale);
    this.showLanguageDropdown = false;
  }

  /**
   * Toggle language dropdown
   */
  toggleLanguageDropdown(): void {
    this.showLanguageDropdown = !this.showLanguageDropdown;
  }

  /**
   * Toggle autoplay controls
   */
  toggleAutoplayControls(): void {
    this.showAutoplayControls = !this.showAutoplayControls;
  }

  /**
   * Adjust seconds per panel
   */
  adjustSecondsPerPanel(delta: number): void {
    const newValue = Math.max(0.5, Math.min(120, this.secondsPerPanel + delta));
    this.secondsPerPanelChange.emit(newValue);
  }

  /**
   * Handle speech toggle
   */
  onToggleSpeech(): void {
    this.toggleSpeech.emit();
  }

  /**
   * Handle audio toggle
   */
  onToggleAudio(): void {
    this.toggleAudio.emit();
  }

  /**
   * Handle SFX toggle
   */
  onToggleSfx(): void {
    this.toggleSfx.emit();
  }

  /**
   * Handle autoplay toggle
   */
  onToggleAutoplay(): void {
    this.toggleAutoplay.emit();
  }

  /**
   * Handle thumbnails toggle
   */
  onToggleThumbnails(): void {
    this.toggleThumbnails.emit();
  }

  /**
   * Handle ToC open
   */
  onOpenToc(): void {
    this.openToc.emit();
  }

  /**
   * Handle settings open
   */
  onOpenSettings(): void {
    this.openSettings.emit();
  }

  /**
   * Handle characters open
   */
  onOpenCharacters(): void {
    this.openCharacters.emit();
  }

  /**
   * Handle alternative cycle
   */
  onCycleAlternative(): void {
    this.cycleAlternative.emit();
  }

  /**
   * Handle branches display
   */
  onShowBranches(): void {
    this.showBranches.emit();
  }

  /**
   * Handle extras open
   */
  onOpenExtras(): void {
    this.openExtras.emit();
  }

  /**
   * Handle like
   */
  onLike(): void {
    this.like.emit();
  }

  /**
   * Handle bookmark
   */
  onBookmark(): void {
    this.bookmark.emit();
  }

  /**
   * Handle share
   */
  onShare(): void {
    this.share.emit();
  }

  /**
   * Handle comments
   */
  onOpenComments(): void {
    this.openComments.emit();
  }

  /**
   * Handle close
   */
  onClose(): void {
    this.close.emit();
  }
}
