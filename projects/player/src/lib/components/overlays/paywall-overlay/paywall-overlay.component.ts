/**
 * Paywall Overlay Component
 * Displays paywall gate UI with purchase options
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
import type { PaywallGate, PurchaseInfo } from '../../../types/entitlement.types';
import type { LocaleCode, LocalizedString } from '../../../types';

/**
 * Paywall action
 */
export type PaywallAction = 'purchase' | 'subscribe' | 'login' | 'dismiss';

/**
 * Paywall Overlay Component
 * Modal overlay for gated content
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
   * Visibility state
   */
  @Input() visible = false;

  /**
   * Paywall gate information
   */
  @Input() gate?: PaywallGate;

  /**
   * Available purchase options
   */
  @Input() purchaseOptions: PurchaseInfo[] = [];

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Custom title
   */
  @Input() title?: LocalizedString;

  /**
   * Custom message
   */
  @Input() message?: LocalizedString;

  /**
   * Show preview button
   */
  @Input() allowPreview = false;

  /**
   * Show login option
   */
  @Input() showLogin = true;

  /**
   * Action taken
   */
  @Output() action = new EventEmitter<PaywallAction>();

  /**
   * Purchase selected
   */
  @Output() purchase = new EventEmitter<string>();

  /**
   * Close overlay
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Handle escape key
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible) {
      this.onDismiss();
    }
  }

  /**
   * Get localized title
   */
  getTitle(): string {
    if (this.title) {
      return this.getLocalizedString(this.title);
    }

    switch (this.gate?.scope) {
      case 'work':
        return 'Unlock This Comic';
      case 'chapter':
        return 'Unlock This Chapter';
      case 'panel':
        return 'Unlock Premium Content';
      default:
        return 'Premium Content';
    }
  }

  /**
   * Get localized message
   */
  getMessage(): string {
    if (this.message) {
      return this.getLocalizedString(this.message);
    }

    if (this.gate?.reason) {
      return this.gate.reason;
    }

    return 'This content requires a subscription or purchase to access.';
  }

  /**
   * Handle purchase option selection
   */
  onPurchaseOption(productId: string): void {
    this.purchase.emit(productId);
    this.action.emit('purchase');
  }

  /**
   * Handle login action
   */
  onLogin(): void {
    this.action.emit('login');
  }

  /**
   * Handle dismiss
   */
  onDismiss(): void {
    this.action.emit('dismiss');
    this.close.emit();
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onDismiss();
    }
  }

  /**
   * Format price
   */
  formatPrice(amount: number, currency: string): string {
    return new Intl.NumberFormat(this.locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  /**
   * Get localized string
   */
  private getLocalizedString(str: LocalizedString): string {
    if (typeof str === 'string') {
      return str;
    }
    return str[this.locale] || str['en-US'] || Object.values(str)[0] || '';
  }

  /**
   * Get purchase type label
   */
  getPurchaseTypeLabel(type: string): string {
    switch (type) {
      case 'one-time':
        return 'Buy Once';
      case 'subscription':
        return 'Subscribe';
      case 'token':
        return 'Use Token';
      default:
        return 'Purchase';
    }
  }
}
