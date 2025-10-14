/**
 * Paywall Overlay Component
 * Displays entitlement messages and purchase CTAs
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { LocaleCode, LocalizedString } from '../../../types';

/**
 * Entitlement status
 */
export type EntitlementStatus = 'locked' | 'preview' | 'subscription' | 'purchase';

/**
 * Purchase result
 */
export interface PurchaseResult {
  success: boolean;
  error?: string;
}

/**
 * Paywall Overlay Component
 * Overlay for gated content requiring payment/subscription
 */
@Component({
  selector: 'pw-paywall-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paywall-overlay.component.html',
  styleUrls: ['./paywall-overlay.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaywallOverlayComponent {
  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Entitlement status type
   */
  @Input() status: EntitlementStatus = 'locked';

  /**
   * Title/heading
   */
  @Input() title: LocalizedString = {};

  /**
   * Description message
   */
  @Input() message: LocalizedString = {};

  /**
   * CTA button text
   */
  @Input() ctaText: LocalizedString = {};

  /**
   * Price information (optional)
   */
  @Input() price?: string;

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Processing purchase state
   */
  @Input() processing = false;

  /**
   * Purchase/unlock initiated
   */
  @Output() purchase = new EventEmitter<void>();

  /**
   * Close overlay (for preview mode)
   */
  @Output() close = new EventEmitter<void>();

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
   * Get title
   */
  getTitle(): string {
    const localized = this.getLocalizedString(this.title);
    if (localized) return localized;

    // Default titles based on status
    switch (this.status) {
      case 'locked':
        return 'Content Locked';
      case 'preview':
        return 'Preview Mode';
      case 'subscription':
        return 'Subscribe to Continue';
      case 'purchase':
        return 'Purchase to Unlock';
      default:
        return 'Premium Content';
    }
  }

  /**
   * Get message
   */
  getMessage(): string {
    const localized = this.getLocalizedString(this.message);
    if (localized) return localized;

    // Default messages based on status
    switch (this.status) {
      case 'locked':
        return 'This content is locked. Please purchase or subscribe to access.';
      case 'preview':
        return 'You are viewing a preview. Subscribe to read the full content.';
      case 'subscription':
        return 'Subscribe to unlock this and all premium content.';
      case 'purchase':
        return 'Purchase this content to unlock full access.';
      default:
        return 'This content requires premium access.';
    }
  }

  /**
   * Get CTA text
   */
  getCtaText(): string {
    const localized = this.getLocalizedString(this.ctaText);
    if (localized) return localized;

    // Default CTA based on status
    switch (this.status) {
      case 'locked':
        return 'Unlock Now';
      case 'preview':
        return 'Subscribe';
      case 'subscription':
        return 'Subscribe Now';
      case 'purchase':
        return 'Purchase';
      default:
        return 'Get Access';
    }
  }

  /**
   * Get icon based on status
   */
  getIcon(): string {
    switch (this.status) {
      case 'locked':
        return '🔒';
      case 'preview':
        return '👁️';
      case 'subscription':
        return '⭐';
      case 'purchase':
        return '💎';
      default:
        return '🔒';
    }
  }

  /**
   * Trigger purchase
   */
  onPurchase(): void {
    if (!this.processing) {
      this.purchase.emit();
    }
  }

  /**
   * Close overlay (preview mode only)
   */
  onClose(): void {
    if (this.status === 'preview') {
      this.close.emit();
    }
  }
}
