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
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import { PwIconComponent } from '../../icon/pw-icon.component';
import type { AssetCategory, LocaleCode, LocalizedString } from '../../../types';
import { AssetUrlService } from '../../../services/asset-url.service';

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
  /** Character sheets: names of the characters shown (one, or several on an ensemble sheet). */
  characters?: LocalizedString[];
}

/**
 * Extras Viewer Component
 * Modal for displaying and browsing extras
 */
@Component({
    selector: 'pw-extras-viewer',
    imports: [TranslatePipe, PwIconComponent],
    templateUrl: './extras-viewer.component.html',
    styleUrls: ['./extras-viewer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExtrasViewerComponent implements OnChanges {
  /**
   * List of extras
   */
  @Input() extras: Extra[] = [];

  /**
   * Extra item to open when the viewer becomes visible (hotspot openExtras)
   */
  @Input() initialExtraId?: string;

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  private readonly assetUrl = inject(AssetUrlService);

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
   * Names of the characters a character sheet shows ("Ferdl · Lena · Tobi").
   */
  getExtraCharacters(extra: Extra): string {
    return (extra.characters ?? [])
      .map((name) => this.getLocalizedString(name))
      .filter((name) => name.length > 0)
      .join(' · ');
  }

  /**
   * Thumbnail URL: absolute as-is, relative via the manifest's assets.base / manifest URL.
   */
  getThumbnailUrl(extra: Extra): string {
    return this.assetUrl.resolve(extra.thumbnail, 'image');
  }

  /**
   * Asset URL, resolved with the base of the extra's media type (image / video /
   * audio; documents fall back to mediaBase).
   */
  getAssetUrl(extra: Extra): string {
    return this.assetUrl.resolve(extra.asset, extraCategory(extra));
  }

  /**
   * Check if extra is accessible
   */
  isAccessible(extra: Extra): boolean {
    return !extra.gated || this.hasPremiumAccess;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.initialExtraId) {
      const match = this.extras.find((e) => e.id === this.initialExtraId);
      if (match) {
        this.openExtra(match);
      }
    }
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
   * Get media type icon (Lucide icon name for {@link PwIconComponent})
   */
  getMediaIcon(extra: Extra): string {
    switch (extra.mediaType) {
      case 'image': return 'lucideImage';
      case 'video': return 'lucideClapperboard';
      case 'audio': return 'lucideMusic';
      case 'document': return 'lucideFileText';
      default: return 'lucidePaperclip';
    }
  }
}

/** The asset category an extra's media type maps to for base-URL selection. */
function extraCategory(extra: Extra): AssetCategory | undefined {
  return extra.mediaType === 'image' || extra.mediaType === 'video' || extra.mediaType === 'audio'
    ? extra.mediaType
    : undefined;
}
