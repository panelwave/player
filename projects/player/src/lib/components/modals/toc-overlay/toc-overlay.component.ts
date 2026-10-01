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
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  HostListener,
  inject,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { PwIconComponent } from '../../icon/pw-icon.component';
import { AssetUrlService } from '../../../services/asset-url.service';
import { ManifestService } from '../../../services/manifest.service';
import { PaywallService } from '../../../services/paywall.service';
import { pagesForFormat } from '../../../utils/page-format-utils';
import { panelThumbnailSrc } from '../../../utils/thumbnail-utils';
import { chapterReadingOrder } from '../../../utils/reading-order';
import { isLockedPanel } from '../../../utils/panel-lock';
import type { CatalogLike } from '../../../utils/extras-utils';
import type { Chapter, Panel, Page, LocaleCode, LocalizedString, PanelWaveManifest } from '../../../types';

/**
 * ToC navigation target
 */
export interface TocNavigationTarget {
  chapterId: string;
  panelId?: string;
  /** The reader picked the cover (chapterId is empty then). */
  cover?: boolean;
}

/**
 * Table of Contents Overlay Component
 * Modal overlay for chapter/panel navigation
 */
@Component({
    selector: 'pw-toc-overlay',
    imports: [FormsModule, TranslatePipe, PwIconComponent],
    templateUrl: './toc-overlay.component.html',
    styleUrls: ['./toc-overlay.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TocOverlayComponent implements OnInit, OnChanges {
  /**
   * Manifest (optional, will extract chapters)
   */
  @Input() manifest?: PanelWaveManifest;

  /**
   * List of chapters (alternative to manifest)
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

  private readonly assetUrl = inject(AssetUrlService);
  private readonly manifestService = inject(ManifestService);
  private readonly paywall = inject(PaywallService);

  /**
   * Page format of the page sequence the player shows; only those pages are
   * listed (null: every page).
   */
  @Input() pageFormat: string | null = null;

  /** Thumbnail of the work's cover; a cover entry heads the list when set. */
  @Input() coverThumbnail = '';

  /** The cover is on screen. */
  @Input() coverCurrent = false;

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
    this.syncChapters();
    this.filterChapters();
    this.selectCurrentChapter();
  }

  /**
   * React to manifest / chapter / current-chapter changes after init
   */
  ngOnChanges(changes: SimpleChanges): void {
    const chaptersChanged = !!(changes['manifest'] || changes['chapters']);
    if (chaptersChanged) {
      this.syncChapters();
      this.filterChapters();
      if (this.selectedChapterIndex >= this.filteredChapters.length) {
        this.selectedChapterIndex = Math.max(this.filteredChapters.length - 1, 0);
      }
    }
    if (chaptersChanged || changes['currentChapterId']) {
      this.selectCurrentChapter();
    }
  }

  /**
   * Extract chapters from the manifest when one is provided
   */
  private syncChapters(): void {
    if (this.manifest?.chapters) {
      this.chapters = Object.values(this.manifest.chapters);
    }
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
   * Get panels for chapter with IDs
   */
  getPanels(chapter: Chapter): { id: string; panel: Panel }[] {
    if (!chapter.panels) return [];
    return chapterReadingOrder(chapter)
      .filter((id) => chapter.panels[id])
      .map((id) => ({ id, panel: chapter.panels[id] }));
  }

  /**
   * Get pages for chapter
   */
  getPages(chapter: Chapter): Page[] {
    return pagesForFormat(chapter.pages, this.pageFormat);
  }

  /**
   * Check if chapter has pages
   */
  hasPages(chapter: Chapter): boolean {
    return this.getPages(chapter).length > 0;
  }

  /**
   * Get panels for a specific page
   */
  getPanelsForPage(chapter: Chapter, page: Page): { id: string; panel: Panel }[] {
    if (!chapter.panels || !page.readingOrder) return [];
    
    return page.readingOrder
      .filter(panelId => chapter.panels[panelId])
      .map(panelId => ({
        id: panelId,
        panel: chapter.panels[panelId]
      }));
  }

  /**
   * Get page title
   */
  getPageTitle(page: Page): string {
    return this.getLocalizedString(page.title) || `Page ${page.id}`;
  }

  /**
   * Get panel title
   */
  getPanelTitle(panel: Panel, panelId: string): string {
    return this.getLocalizedString(panel.title) || panelId;
  }

  /**
   * Thumbnail URL for a panel: absolute as-is, relative via the manifest's assets.base / manifest URL.
   */
  /**
   * Small rendition of the panel's artwork (none for a locked panel: its art
   * is not shown ahead of the gate).
   */
  getThumbnailUrl(panel: Panel, panelId?: string): string {
    if (isLockedPanel(panel) || (panelId && this.paywall.isPanelLocked(panelId))) {
      return '';
    }
    const lookup = (assetId: string): CatalogLike | null =>
      this.manifestService.getAsset(assetId) as CatalogLike | null;
    return this.assetUrl.resolve(panelThumbnailSrc(panel, lookup), 'image');
  }

  /** Cover thumbnail URL (empty when the work has no cover). */
  getCoverUrl(): string {
    return this.coverThumbnail ? this.assetUrl.resolve(this.coverThumbnail, 'image') : '';
  }

  navigateToCover(): void {
    this.navigate.emit({ chapterId: '', cover: true });
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
  navigateToPanel(chapter: Chapter, panelId: string): void {
    this.navigate.emit({
      chapterId: chapter.id,
      panelId: panelId,
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
  isCurrentPanel(panelId: string): boolean {
    return panelId === this.currentPanelId;
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
        // Focused interactive elements (chapter headers/items, panel cards,
        // buttons) handle Enter themselves; acting here too would emit twice.
        if (this.isOwnEnterTarget(event.target)) return;
        event.preventDefault();
        if (this.filteredChapters[this.selectedChapterIndex]) {
          this.navigateToChapter(this.filteredChapters[this.selectedChapterIndex]);
        }
        break;
    }
  }

  /**
   * Whether a keyboard event target is an interactive element with its own
   * Enter handling (the search input is deliberately not one of them).
   */
  private isOwnEnterTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest('button, a[href], select, textarea, [tabindex]:not([tabindex="-1"])');
  }

  /**
   * Get selected chapter
   */
  getSelectedChapter(): Chapter | undefined {
    return this.filteredChapters[this.selectedChapterIndex];
  }
}
