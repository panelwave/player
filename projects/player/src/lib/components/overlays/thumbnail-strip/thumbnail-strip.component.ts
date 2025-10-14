/**
 * Thumbnail Strip Component
 * Displays panel thumbnails for navigation
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Chapter, Panel } from '../../../types';

/**
 * Thumbnail navigation target
 */
export interface ThumbnailNavigationTarget {
  chapterId: string;
  panelId: string;
}

/**
 * Thumbnail item with metadata
 */
interface ThumbnailItem {
  chapterId: string;
  panelId: string;
  thumbnail?: string;
  isLocked: boolean;
  isCurrentChapter: boolean;
  isCurrentPanel: boolean;
  chapterStart: boolean;
  chapterTitle?: string;
  index: number;
}

/**
 * Thumbnail Strip Component
 * Horizontal strip of panel thumbnails for quick navigation
 */
@Component({
  selector: 'pw-thumbnail-strip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './thumbnail-strip.component.html',
  styleUrls: ['./thumbnail-strip.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThumbnailStripComponent implements OnChanges, AfterViewInit {
  /**
   * Chapters with panels
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
   * Base URL for thumbnails
   */
  @Input() baseUrl = '';

  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Locked panel IDs (for paywall)
   */
  @Input() lockedPanels: string[] = [];

  /**
   * Navigate to panel
   */
  @Output() navigate = new EventEmitter<ThumbnailNavigationTarget>();

  /**
   * Close strip
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Scroll container reference
   */
  @ViewChild('scrollContainer', { static: false }) scrollContainer?: ElementRef<HTMLDivElement>;

  /**
   * Flattened thumbnail items
   */
  thumbnailItems: ThumbnailItem[] = [];

  /**
   * Virtual scroll viewport
   */
  viewportStart = 0;
  viewportEnd = 50; // Show 50 items at a time
  itemWidth = 120; // Width of each thumbnail
  itemGap = 8; // Gap between items

  /**
   * Handle changes
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chapters'] || changes['currentChapterId'] || changes['currentPanelId'] || changes['lockedPanels']) {
      this.buildThumbnailItems();
    }
  }

  /**
   * After view init
   */
  ngAfterViewInit(): void {
    this.scrollToCurrentPanel();
  }

  /**
   * Build flattened thumbnail items
   */
  private buildThumbnailItems(): void {
    const items: ThumbnailItem[] = [];
    let globalIndex = 0;

    this.chapters.forEach((chapter) => {
      const panels = this.getPanels(chapter);
      
      panels.forEach((panel, panelIndex) => {
        items.push({
          chapterId: chapter.id,
          panelId: panel.id,
          thumbnail: panel.thumbnail,
          isLocked: this.isPanelLocked(panel.id),
          isCurrentChapter: chapter.id === this.currentChapterId,
          isCurrentPanel: panel.id === this.currentPanelId,
          chapterStart: panelIndex === 0,
          chapterTitle: panelIndex === 0 ? this.getChapterTitle(chapter) : undefined,
          index: globalIndex++,
        });
      });
    });

    this.thumbnailItems = items;
  }

  /**
   * Get panels from chapter
   */
  private getPanels(chapter: Chapter): Panel[] {
    if (!chapter.panels) return [];
    return Object.values(chapter.panels);
  }

  /**
   * Get chapter title
   */
  private getChapterTitle(chapter: Chapter): string {
    // Simplified - should use localization
    if (chapter.title && typeof chapter.title === 'object') {
      const keys = Object.keys(chapter.title);
      return keys.length > 0 ? (chapter.title as any)[keys[0]] : chapter.id;
    }
    return chapter.id;
  }

  /**
   * Check if panel is locked
   */
  private isPanelLocked(panelId: string): boolean {
    return this.lockedPanels.includes(panelId);
  }

  /**
   * Get thumbnail URL
   */
  getThumbnailUrl(item: ThumbnailItem): string {
    if (!item.thumbnail) {
      return '';
    }

    // Absolute URL
    if (
      item.thumbnail.startsWith('http://') ||
      item.thumbnail.startsWith('https://') ||
      item.thumbnail.startsWith('data:')
    ) {
      return item.thumbnail;
    }

    // Relative URL
    return this.baseUrl + item.thumbnail;
  }

  /**
   * Navigate to panel
   */
  onNavigate(item: ThumbnailItem): void {
    if (!item.isLocked) {
      this.navigate.emit({
        chapterId: item.chapterId,
        panelId: item.panelId,
      });
    }
  }

  /**
   * Close strip
   */
  onClose(): void {
    this.close.emit();
  }

  /**
   * Scroll to current panel
   */
  scrollToCurrentPanel(): void {
    if (!this.scrollContainer) return;

    const currentIndex = this.thumbnailItems.findIndex((item) => item.isCurrentPanel);
    if (currentIndex >= 0) {
      const scrollPosition = currentIndex * (this.itemWidth + this.itemGap);
      const containerWidth = this.scrollContainer.nativeElement.offsetWidth;
      const centeredPosition = scrollPosition - containerWidth / 2 + this.itemWidth / 2;

      this.scrollContainer.nativeElement.scrollTo({
        left: Math.max(0, centeredPosition),
        behavior: 'smooth',
      });
    }
  }

  /**
   * Handle scroll for virtual scrolling
   */
  onScroll(event: Event): void {
    const target = event.target as HTMLElement;
    const scrollLeft = target.scrollLeft;
    const containerWidth = target.offsetWidth;

    // Calculate visible range with buffer
    const buffer = 10;
    this.viewportStart = Math.max(0, Math.floor(scrollLeft / (this.itemWidth + this.itemGap)) - buffer);
    this.viewportEnd = Math.ceil((scrollLeft + containerWidth) / (this.itemWidth + this.itemGap)) + buffer;
  }

  /**
   * Check if item is in viewport
   */
  isInViewport(item: ThumbnailItem): boolean {
    return item.index >= this.viewportStart && item.index <= this.viewportEnd;
  }

  /**
   * Get total scroll width
   */
  getTotalWidth(): number {
    return this.thumbnailItems.length * (this.itemWidth + this.itemGap);
  }

  /**
   * Get visible items (for virtual scrolling)
   */
  getVisibleItems(): ThumbnailItem[] {
    return this.thumbnailItems.filter((item) => this.isInViewport(item));
  }
}
