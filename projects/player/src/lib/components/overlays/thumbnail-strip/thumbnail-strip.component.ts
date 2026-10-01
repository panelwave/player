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
  HostListener,
  Injector,
  afterNextRender,
  inject,
} from '@angular/core';

import type { Chapter, LocaleCode, Panel } from '../../../types';
import { PwIconComponent } from '../../icon/pw-icon.component';
import { AssetUrlService } from '../../../services/asset-url.service';
import { ManifestService } from '../../../services/manifest.service';
import { PaywallService } from '../../../services/paywall.service';
import { chapterReadingOrder } from '../../../utils/reading-order';
import { panelThumbnailSrc } from '../../../utils/thumbnail-utils';
import { isLockedPanel } from '../../../utils/panel-lock';
import { resolveLocalizedString } from '../../../utils/locale-utils';
import type { CatalogLike } from '../../../utils/extras-utils';

/**
 * Thumbnail navigation target. `cover: true` asks for the work's cover
 * (chapterId/panelId are empty then).
 */
export interface ThumbnailNavigationTarget {
  chapterId: string;
  panelId: string;
  cover?: boolean;
}

/** Kinds of tiles in the strip: the cover, a chapter separator, a panel. */
export type ThumbnailItemKind = 'cover' | 'chapter' | 'panel';

/**
 * One tile of the strip, with its horizontal slot (`left`/`width`, px).
 */
export interface ThumbnailItem {
  kind: ThumbnailItemKind;
  /** Unique key of the tile (track expression). */
  key: string;
  chapterId: string;
  /** Panel id; empty for the cover and chapter separators. */
  panelId: string;
  thumbnail?: string;
  isLocked: boolean;
  isCurrentChapter: boolean;
  isCurrentPanel: boolean;
  /** First panel of its chapter. */
  chapterStart: boolean;
  /** Chapter separator: title and 1-based number. */
  chapterTitle?: string;
  chapterNumber?: number;
  /** Position in the strip (0-based, all kinds). */
  index: number;
  left: number;
  width: number;
}

/**
 * Thumbnail Strip Component
 * Horizontal strip for quick navigation: the cover, then per chapter a
 * separator and the chapter's panels in reading order, each shown with a
 * small rendition of its artwork.
 */
@Component({
    selector: 'pw-thumbnail-strip',
    imports: [PwIconComponent],
    templateUrl: './thumbnail-strip.component.html',
    styleUrls: ['./thumbnail-strip.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThumbnailStripComponent implements OnChanges, AfterViewInit {
  private readonly injector = inject(Injector);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly manifestService = inject(ManifestService);
  private readonly paywall = inject(PaywallService);

  /**
   * Whether a post-render scroll to the current panel is already queued
   */
  private scrollQueued = false;

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
   * Further panels shown right now (page view: every panel of the page).
   */
  @Input() currentPanelIds: string[] = [];

  /**
   * Thumbnail of the work's cover; the cover tile heads the strip when set.
   */
  @Input() coverThumbnail = '';

  /**
   * The cover is on screen.
   */
  @Input() coverCurrent = false;

  /**
   * Locale for chapter titles
   */
  @Input() locale: LocaleCode = 'en-US';

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
   * Flattened strip tiles
   */
  thumbnailItems: ThumbnailItem[] = [];

  /**
   * Virtual scroll window (px of the strip's content)
   */
  viewportStart = 0;
  viewportEnd = 50 * 128; // about 50 tiles before the first scroll
  itemWidth = 120; // Width of a panel / cover thumbnail
  separatorWidth = 96; // Width of a chapter separator
  itemGap = 8; // Gap between tiles

  /**
   * Drag scrolling state
   */
  private isDragging = false;
  private startX = 0;
  private dragScrollLeft = 0;

  /**
   * Handle changes
   */
  ngOnChanges(changes: SimpleChanges): void {
    const rebuild = ['chapters', 'currentChapterId', 'currentPanelId', 'currentPanelIds', 'lockedPanels', 'coverThumbnail', 'coverCurrent', 'locale'];
    if (rebuild.some((key) => changes[key])) {
      this.buildThumbnailItems();
    }

    // The scroll container only exists inside @if (visible): when the strip
    // is shown later, or the current panel/chapters change, scroll once the
    // view has rendered. The initial render is covered by ngAfterViewInit.
    const scrollTriggers = ['visible', 'currentPanelId', 'currentPanelIds', 'coverCurrent', 'chapters'];
    const needsScroll = scrollTriggers.some((key) => changes[key] && !changes[key].firstChange);
    if (needsScroll && this.visible) {
      this.queueScrollToCurrentPanel();
    }
  }

  /**
   * Scroll to the current panel after the next render
   */
  private queueScrollToCurrentPanel(): void {
    if (this.scrollQueued) return;
    this.scrollQueued = true;
    afterNextRender(
      () => {
        this.scrollQueued = false;
        this.scrollToCurrentPanel();
      },
      { injector: this.injector },
    );
  }

  /**
   * After view init
   */
  ngAfterViewInit(): void {
    this.scrollToCurrentPanel();
  }

  /**
   * Build the strip: cover, then per chapter a separator and its panels.
   */
  private buildThumbnailItems(): void {
    const items: ThumbnailItem[] = [];
    let left = 0;
    const push = (item: Omit<ThumbnailItem, 'index' | 'left' | 'width'>, width: number): void => {
      items.push({ ...item, index: items.length, left, width });
      left += width + this.itemGap;
    };

    if (this.coverThumbnail) {
      push(
        {
          kind: 'cover',
          key: 'cover',
          chapterId: '',
          panelId: '',
          thumbnail: this.coverThumbnail,
          isLocked: false,
          isCurrentChapter: false,
          isCurrentPanel: this.coverCurrent,
          chapterStart: false,
        },
        this.itemWidth
      );
    }

    const current = new Set(this.currentPanelIds);
    if (this.currentPanelId) current.add(this.currentPanelId);

    this.chapters.forEach((chapter, chapterIndex) => {
      const panels = this.getPanels(chapter);
      if (panels.length === 0) return;
      const isCurrentChapter = chapter.id === this.currentChapterId;

      push(
        {
          kind: 'chapter',
          key: `chapter:${chapter.id}`,
          chapterId: chapter.id,
          panelId: '',
          isLocked: false,
          isCurrentChapter,
          isCurrentPanel: false,
          chapterStart: false,
          chapterTitle: this.getChapterTitle(chapter),
          chapterNumber: chapterIndex + 1,
        },
        this.separatorWidth
      );

      panels.forEach((panel, panelIndex) => {
        const locked = this.isPanelLocked(panel.id, panel);
        push(
          {
            kind: 'panel',
            key: `panel:${chapter.id}:${panel.id}`,
            chapterId: chapter.id,
            panelId: panel.id,
            // Locked artwork is not shown ahead of the gate.
            thumbnail: locked ? undefined : panel.thumbnail,
            isLocked: locked,
            isCurrentChapter,
            isCurrentPanel: !this.coverCurrent && (!this.currentChapterId || isCurrentChapter) && current.has(panel.id),
            chapterStart: panelIndex === 0,
          },
          this.itemWidth
        );
      });
    });

    this.thumbnailItems = items;
  }

  /**
   * The chapter's panels in reading order, each with its thumbnail source.
   */
  private getPanels(chapter: Chapter): (Panel & { id: string; thumbnail?: string })[] {
    if (!chapter.panels) return [];
    const lookup = (assetId: string): CatalogLike | null =>
      this.manifestService.getAsset(assetId) as CatalogLike | null;
    return chapterReadingOrder(chapter)
      .filter((id) => chapter.panels[id])
      .map((id) => {
        const panel = chapter.panels[id];
        return { ...panel, id, thumbnail: panelThumbnailSrc(panel, lookup) || undefined };
      });
  }

  /**
   * Chapter title in the current locale, falling back to the chapter id
   */
  private getChapterTitle(chapter: Chapter): string {
    if (chapter.title && typeof chapter.title === 'object') {
      const fallback = Object.keys(chapter.title)[0] ?? this.locale;
      return resolveLocalizedString(chapter.title, this.locale, fallback) || chapter.id;
    }
    return chapter.id;
  }

  /**
   * A panel is locked when the host lists it, it is a server-stripped stub,
   * or the paywall locks it for this reader.
   */
  private isPanelLocked(panelId: string, panel?: Panel): boolean {
    return this.lockedPanels.includes(panelId) || isLockedPanel(panel) || this.paywall.isPanelLocked(panelId);
  }

  /**
   * Thumbnail URL: absolute as-is, relative via the manifest's assets.base / manifest URL.
   */
  getThumbnailUrl(item: ThumbnailItem): string {
    return this.assetUrl.resolve(item.thumbnail, 'image');
  }

  /**
   * Accessible name of a tile
   */
  getItemLabel(item: ThumbnailItem): string {
    if (item.kind === 'cover') return 'Cover';
    if (item.kind === 'chapter') return `Chapter ${item.chapterNumber}: ${item.chapterTitle}`;
    return 'Panel ' + item.panelId;
  }

  /**
   * Navigate to the tile's target. Panels the host locked stay closed; a
   * paywall-locked panel navigates, which raises its gate. A chapter
   * separator opens the chapter's first panel.
   */
  onNavigate(item: ThumbnailItem): void {
    if (item.kind === 'cover') {
      this.navigate.emit({ chapterId: '', panelId: '', cover: true });
      return;
    }
    if (item.kind === 'chapter') {
      const first = this.thumbnailItems.find((i) => i.kind === 'panel' && i.chapterId === item.chapterId);
      if (first) this.onNavigate(first);
      return;
    }
    if (!this.lockedPanels.includes(item.panelId)) {
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
   * Scroll to current panel (the first current tile)
   */
  scrollToCurrentPanel(): void {
    if (!this.scrollContainer) return;

    const current = this.thumbnailItems.find((item) => item.isCurrentPanel);
    if (current) {
      const containerWidth = this.scrollContainer.nativeElement.offsetWidth;
      const centeredPosition = current.left - containerWidth / 2 + current.width / 2;

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

    // Visible range with a buffer of about ten tiles on either side
    const buffer = 10 * (this.itemWidth + this.itemGap);
    this.viewportStart = Math.max(0, scrollLeft - buffer);
    this.viewportEnd = scrollLeft + containerWidth + buffer;
  }

  /**
   * Check if item is in viewport
   */
  isInViewport(item: ThumbnailItem): boolean {
    return item.left + item.width >= this.viewportStart && item.left <= this.viewportEnd;
  }

  /**
   * Get total scroll width
   */
  getTotalWidth(): number {
    const last = this.thumbnailItems[this.thumbnailItems.length - 1];
    return last ? last.left + last.width + this.itemGap : 0;
  }

  /**
   * Get visible items (for virtual scrolling)
   */
  getVisibleItems(): ThumbnailItem[] {
    return this.thumbnailItems.filter((item) => this.isInViewport(item));
  }

  /**
   * Scroll left by one viewport width
   */
  scrollLeft(): void {
    if (!this.scrollContainer) return;

    const container = this.scrollContainer.nativeElement;
    const scrollAmount = container.offsetWidth * 0.8; // Scroll 80% of viewport

    container.scrollTo({
      left: Math.max(0, container.scrollLeft - scrollAmount),
      behavior: 'smooth',
    });
  }

  /**
   * Scroll right by one viewport width
   */
  scrollRight(): void {
    if (!this.scrollContainer) return;

    const container = this.scrollContainer.nativeElement;
    const scrollAmount = container.offsetWidth * 0.8; // Scroll 80% of viewport
    const maxScroll = container.scrollWidth - container.offsetWidth;

    container.scrollTo({
      left: Math.min(maxScroll, container.scrollLeft + scrollAmount),
      behavior: 'smooth',
    });
  }

  /**
   * Check if can scroll left
   */
  canScrollLeft(): boolean {
    if (!this.scrollContainer) return false;
    return this.scrollContainer.nativeElement.scrollLeft > 0;
  }

  /**
   * Check if can scroll right
   */
  canScrollRight(): boolean {
    if (!this.scrollContainer) return false;
    const container = this.scrollContainer.nativeElement;
    return container.scrollLeft < container.scrollWidth - container.offsetWidth - 1;
  }

  /**
   * Handle keyboard navigation
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    if (!this.visible) return;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.scrollLeft();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.scrollRight();
        break;
      case 'Escape':
        event.preventDefault();
        this.onClose();
        break;
    }
  }

  /**
   * Start drag scrolling
   */
  onMouseDown(event: MouseEvent): void {
    if (!this.scrollContainer) return;

    this.isDragging = true;
    this.startX = event.pageX - this.scrollContainer.nativeElement.offsetLeft;
    this.dragScrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    this.scrollContainer.nativeElement.style.cursor = 'grabbing';
  }

  /**
   * Handle drag scrolling
   */
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging || !this.scrollContainer) return;

    event.preventDefault();
    const x = event.pageX - this.scrollContainer.nativeElement.offsetLeft;
    const walk = (x - this.startX) * 2; // Multiply for faster scrolling
    this.scrollContainer.nativeElement.scrollLeft = this.dragScrollLeft - walk;
  }

  /**
   * End drag scrolling
   */
  onMouseUp(): void {
    if (!this.scrollContainer) return;

    this.isDragging = false;
    this.scrollContainer.nativeElement.style.cursor = 'grab';
  }

  /**
   * Handle mouse leave
   */
  onMouseLeave(): void {
    if (this.isDragging) {
      this.onMouseUp();
    }
  }
}
