/**
 * Extras Viewer Component
 * Displays bonus content gallery
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
 * Extra item type
 */
export type ExtraType = 'cover' | 'art' | 'bts' | 'interview' | 'other';

/**
 * Extra item definition
 */
export interface Extra {
  id: string;
  type: ExtraType;
  title: LocalizedString;
  description?: LocalizedString;
  thumbnail?: string;
  asset?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  gated?: boolean;
  tags?: string[];
}

/**
 * Extras Viewer Component
 * Modal for displaying and browsing extras
 */
@Component({
  selector: 'pw-extras-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './extras-viewer.component.html',
  styleUrls: ['./extras-viewer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtrasViewerComponent {
  /**
   * List of extras
   */
  @Input() extras: Extra[] = [];

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
   * User has premium access
   */
  @Input() hasPremiumAccess = false;

  /**
   * Purchase triggered
   */
  @Output() purchase = new EventEmitter<void>();

  /**
   * Close viewer
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Selected extra for detail view
   */
  selectedExtra?: Extra;

  /**
   * Current filter type
   */
  filterType: ExtraType | 'all' = 'all';

  /**
   * Get filtered extras
   */
  getFilteredExtras(): Extra[] {
    if (this.filterType === 'all') {
      return this.extras;
    }
    return this.extras.filter((extra) => extra.type === this.filterType);
  }

  /**
   * Get extras by type for filter counts
   */
  getExtrasByType(type: ExtraType): number {
    return this.extras.filter((extra) => extra.type === type).length;
  }

  /**
   * Check if any extras are gated
   */
  hasGatedExtras(): boolean {
    return this.extras.some((extra) => extra.gated);
  }

  /**
   * Set filter type
   */
  setFilter(type: ExtraType | 'all'): void {
    this.filterType = type;
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
   * Get extra title
   */
  getExtraTitle(extra: Extra): string {
    return this.getLocalizedString(extra.title) || extra.id;
  }

  /**
   * Get extra description
   */
  getExtraDescription(extra: Extra): string {
    return this.getLocalizedString(extra.description) || '';
  }

  /**
   * Get thumbnail URL
   */
  getThumbnailUrl(extra: Extra): string {
    if (!extra.thumbnail) {
      return '';
    }

    // Absolute URL
    if (
      extra.thumbnail.startsWith('http://') ||
      extra.thumbnail.startsWith('https://') ||
      extra.thumbnail.startsWith('data:')
    ) {
      return extra.thumbnail;
    }

    // Relative URL
    return this.baseUrl + extra.thumbnail;
  }

  /**
   * Get asset URL
   */
  getAssetUrl(extra: Extra): string {
    if (!extra.asset) {
      return '';
    }

    // Absolute URL
    if (
      extra.asset.startsWith('http://') ||
      extra.asset.startsWith('https://') ||
      extra.asset.startsWith('data:')
    ) {
      return extra.asset;
    }

    // Relative URL
    return this.baseUrl + extra.asset;
  }

  /**
   * Check if extra is accessible
   */
  isAccessible(extra: Extra): boolean {
    return !extra.gated || this.hasPremiumAccess;
  }

  /**
   * Open extra detail
   */
  openExtra(extra: Extra): void {
    if (!this.isAccessible(extra)) {
      return;
    }
    this.selectedExtra = extra;
  }

  /**
   * Close detail view
   */
  closeDetail(): void {
    this.selectedExtra = undefined;
  }

  /**
   * Trigger purchase
   */
  onPurchase(): void {
    this.purchase.emit();
  }

  /**
   * Close viewer
   */
  onClose(): void {
    this.closeDetail();
    this.close.emit();
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      if (this.selectedExtra) {
        this.closeDetail();
      } else {
        this.onClose();
      }
    }
  }

  /**
   * Handle backdrop keyboard interaction
   */
  onBackdropKeydown(event: KeyboardEvent): void {
    if (event.target === event.currentTarget && 
        (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      if (this.selectedExtra) {
        this.closeDetail();
      } else {
        this.onClose();
      }
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
      if (this.selectedExtra) {
        this.closeDetail();
      } else {
        this.onClose();
      }
    }
  }

  /**
   * Get type display name
   */
  getTypeName(type: ExtraType): string {
    const names: Record<ExtraType, string> = {
      cover: 'Covers',
      art: 'Artwork',
      bts: 'Behind the Scenes',
      interview: 'Interviews',
      other: 'Other',
    };
    return names[type] || type;
  }

  /**
   * Get media type icon
   */
  getMediaIcon(extra: Extra): string {
    switch (extra.mediaType) {
      case 'image': return '🖼️';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'document': return '📄';
      default: return '📎';
    }
  }
}
