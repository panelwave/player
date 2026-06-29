/**
 * Share Modal Component
 * Provides sharing options for panels
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';

import { TranslateModule } from '@ngx-translate/core';
import { PwIconComponent } from '../../icon/pw-icon.component';

/**
 * Share platform
 */
export type SharePlatform = 'twitter' | 'facebook' | 'reddit' | 'email' | 'copy' | 'qr';

/**
 * Share Modal Component
 * Modal for sharing content via various platforms
 */
@Component({
    selector: 'pw-share-modal',
    imports: [TranslateModule, PwIconComponent],
    templateUrl: './share-modal.component.html',
    styleUrls: ['./share-modal.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShareModalComponent {
  /**
   * URL to share
   */
  @Input() shareUrl = '';

  /**
   * Title to share
   */
  @Input() shareTitle = '';

  /**
   * Description to share
   */
  @Input() shareDescription = '';

  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Panel is shareable
   */
  @Input() shareable = true;

  /**
   * Close modal
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Share action triggered
   */
  @Output() share = new EventEmitter<SharePlatform>();

  /**
   * Copy status
   */
  copySuccess = false;

  /**
   * Show QR code
   */
  showQrCode = false;

  /**
   * QR code data URL
   */
  qrCodeDataUrl = '';

  /**
   * Copy link to clipboard
   */
  async copyLink(): Promise<void> {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(this.shareUrl);
        this.copySuccess = true;
        this.share.emit('copy');

        // Reset success message after 2 seconds
        setTimeout(() => {
          this.copySuccess = false;
        }, 2000);
      } else {
        // Fallback for older browsers
        this.fallbackCopyTextToClipboard(this.shareUrl);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  /**
   * Fallback copy method for older browsers
   */
  private fallbackCopyTextToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.copySuccess = true;
        this.share.emit('copy');
        setTimeout(() => {
          this.copySuccess = false;
        }, 2000);
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textArea);
  }

  /**
   * Share on Twitter
   */
  shareOnTwitter(): void {
    const text = encodeURIComponent(this.shareTitle || this.shareDescription);
    const url = encodeURIComponent(this.shareUrl);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    this.share.emit('twitter');
  }

  /**
   * Share on Facebook
   */
  shareOnFacebook(): void {
    const url = encodeURIComponent(this.shareUrl);
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    window.open(facebookUrl, '_blank', 'width=550,height=420');
    this.share.emit('facebook');
  }

  /**
   * Share on Reddit
   */
  shareOnReddit(): void {
    const title = encodeURIComponent(this.shareTitle);
    const url = encodeURIComponent(this.shareUrl);
    const redditUrl = `https://www.reddit.com/submit?title=${title}&url=${url}`;
    window.open(redditUrl, '_blank', 'width=550,height=500');
    this.share.emit('reddit');
  }

  /**
   * Share via Email
   */
  shareViaEmail(): void {
    const subject = encodeURIComponent(this.shareTitle);
    const body = encodeURIComponent(
      `${this.shareDescription}\n\n${this.shareUrl}`
    );
    const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;
    this.share.emit('email');
  }

  /**
   * Toggle QR code display
   */
  toggleQrCode(): void {
    this.showQrCode = !this.showQrCode;
    
    if (this.showQrCode && !this.qrCodeDataUrl) {
      this.generateQrCode();
    }
    
    if (this.showQrCode) {
      this.share.emit('qr');
    }
  }

  /**
   * Generate QR code
   * Uses a simple QR code API service
   */
  private generateQrCode(): void {
    // Using a public QR code API
    const size = 256;
    const url = encodeURIComponent(this.shareUrl);
    this.qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${url}`;
  }

  /**
   * Use native share API if available
   */
  async useNativeShare(): Promise<void> {
    if (navigator.share) {
      try {
        await navigator.share({
          title: this.shareTitle,
          text: this.shareDescription,
          url: this.shareUrl,
        });
        this.share.emit('copy');
      } catch (err) {
        // User cancelled or share failed
        console.log('Share cancelled:', err);
      }
    }
  }

  /**
   * Check if native share is supported
   */
  get isNativeShareSupported(): boolean {
    return !!(navigator.share);
  }

  /**
   * Close modal
   */
  onClose(): void {
    this.showQrCode = false;
    this.copySuccess = false;
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
      this.onClose();
    }
  }
}
