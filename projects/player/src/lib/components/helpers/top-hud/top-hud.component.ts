/**
 * Top HUD Component
 * Heads-up display showing titles and quick action buttons
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';

import { PwIconComponent } from '../../icon/pw-icon.component';


/**
 * Top HUD Component
 * Displays work/chapter/panel info and quick actions
 */
@Component({
    selector: 'pw-top-hud',
    imports: [PwIconComponent],
    templateUrl: './top-hud.component.html',
    styleUrls: ['./top-hud.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TopHudComponent {
  /**
   * Work title
   */
  @Input() workTitle = '';

  /**
   * Chapter title
   */
  @Input() chapterTitle = '';

  /**
   * Panel ID or title
   */
  @Input() panelTitle = '';

  /**
   * Current panel index (1-based)
   */
  @Input() currentPanelIndex = 1;

  /**
   * Total panels in chapter
   */
  @Input() totalPanels = 1;

  /**
   * Visible state
   */
  @Input() visible = true;

  /**
   * Bookmarked state
   */
  @Input() isBookmarked = false;

  /**
   * Liked state
   */
  @Input() isLiked = false;

  /**
   * Bookmark clicked
   */
  @Output() bookmark = new EventEmitter<void>();

  /**
   * Like clicked
   */
  @Output() like = new EventEmitter<void>();

  /**
   * Share clicked
   */
  @Output() share = new EventEmitter<void>();

  /**
   * Auto-hide timeout
   */
  private hideTimeout?: number;

  /**
   * Auto-hide delay (ms)
   */
  private readonly AUTO_HIDE_DELAY = 3000;

  /**
   * Handle bookmark
   */
  onBookmark(): void {
    this.bookmark.emit();
  }

  /**
   * Handle like
   */
  onLike(): void {
    this.like.emit();
  }

  /**
   * Handle share
   */
  onShare(): void {
    this.share.emit();
  }

  /**
   * Get progress percentage
   */
  getProgress(): number {
    if (this.totalPanels === 0) return 0;
    return (this.currentPanelIndex / this.totalPanels) * 100;
  }

  /**
   * Get progress text
   */
  getProgressText(): string {
    return `${this.currentPanelIndex} / ${this.totalPanels}`;
  }

  /**
   * Reset auto-hide timer on mouse move
   */
  @HostListener('mousemove')
  @HostListener('touchstart')
  onUserActivity(): void {
    this.resetAutoHideTimer();
  }

  /**
   * Reset auto-hide timer
   */
  private resetAutoHideTimer(): void {
    if (this.hideTimeout !== undefined) {
      window.clearTimeout(this.hideTimeout);
    }

    // Note: Actual hiding would be controlled by parent component
    // This is just for internal state management
    this.hideTimeout = window.setTimeout(() => {
      // Parent should handle hiding via visible input
    }, this.AUTO_HIDE_DELAY);
  }

  /**
   * Cleanup on destroy
   */
  ngOnDestroy(): void {
    if (this.hideTimeout !== undefined) {
      window.clearTimeout(this.hideTimeout);
    }
  }
}
