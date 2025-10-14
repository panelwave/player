/**
 * Comments Drawer Component
 * Side drawer for viewing and posting comments
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
import { FormsModule } from '@angular/forms';

/**
 * Comment interface
 */
export interface Comment {
  id: string;
  author: string;
  authorAvatar?: string;
  content: string;
  timestamp: Date;
  likes?: number;
  isLiked?: boolean;
  replies?: Comment[];
}

/**
 * Comment post event
 */
export interface CommentPost {
  content: string;
  replyTo?: string;
}

/**
 * Comments Drawer Component
 * Side drawer for comment interaction
 */
@Component({
  selector: 'pw-comments-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './comments-drawer.component.html',
  styleUrls: ['./comments-drawer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentsDrawerComponent {
  /**
   * List of comments
   */
  @Input() comments: Comment[] = [];

  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Loading state
   */
  @Input() loading = false;

  /**
   * Current page
   */
  @Input() currentPage = 1;

  /**
   * Total pages
   */
  @Input() totalPages = 1;

  /**
   * Has more comments
   */
  @Input() hasMore = false;

  /**
   * User is authenticated
   */
  @Input() isAuthenticated = false;

  /**
   * Post comment
   */
  @Output() postComment = new EventEmitter<CommentPost>();

  /**
   * Load more comments
   */
  @Output() loadMore = new EventEmitter<number>();

  /**
   * Like comment
   */
  @Output() likeComment = new EventEmitter<string>();

  /**
   * Close drawer
   */
  @Output() close = new EventEmitter<void>();

  /**
   * New comment content
   */
  newCommentContent = '';

  /**
   * Reply target
   */
  replyTarget?: Comment;

  /**
   * Show reply composer
   */
  showReplyComposer = false;

  /**
   * Reply content
   */
  replyContent = '';

  /**
   * Post new comment
   */
  submitComment(): void {
    const content = this.newCommentContent.trim();
    if (!content || !this.isAuthenticated) {
      return;
    }

    this.postComment.emit({ content });
    this.newCommentContent = '';
  }

  /**
   * Start reply to comment
   */
  startReply(comment: Comment): void {
    this.replyTarget = comment;
    this.showReplyComposer = true;
    this.replyContent = '';
  }

  /**
   * Cancel reply
   */
  cancelReply(): void {
    this.replyTarget = undefined;
    this.showReplyComposer = false;
    this.replyContent = '';
  }

  /**
   * Submit reply
   */
  submitReply(): void {
    const content = this.replyContent.trim();
    if (!content || !this.replyTarget || !this.isAuthenticated) {
      return;
    }

    this.postComment.emit({
      content,
      replyTo: this.replyTarget.id,
    });

    this.cancelReply();
  }

  /**
   * Like a comment
   */
  onLikeComment(comment: Comment): void {
    if (!this.isAuthenticated) {
      return;
    }
    this.likeComment.emit(comment.id);
  }

  /**
   * Load next page
   */
  onLoadMore(): void {
    if (this.hasMore && !this.loading) {
      this.loadMore.emit(this.currentPage + 1);
    }
  }

  /**
   * Format timestamp
   */
  formatTimestamp(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
      return 'Just now';
    } else if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Get author initials
   */
  getAuthorInitials(author: string): string {
    const words = author.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return author.substring(0, 2).toUpperCase();
  }

  /**
   * Close drawer
   */
  onClose(): void {
    this.cancelReply();
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
      if (this.showReplyComposer) {
        this.cancelReply();
      } else {
        this.onClose();
      }
    }
  }
}
