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
  inject,
} from '@angular/core';

import { TranslateService } from '@ngx-translate/core';

import type { PaywallGate, PurchaseInfo } from '../../../types/entitlement.types';
import type { LocaleCode, LocalizedString } from '../../../types';
import { PwIconComponent } from '../../icon/pw-icon.component';

/**
 * Built-in English UI strings, used when no TranslateService is provided or a
 * key is not loaded. Must match the "paywall" section of assets/i18n/en.json.
 */
const PAYWALL_TEXT_EN: Record<string, string> = {
  'paywall.title_work': 'Unlock This Comic',
  'paywall.title_chapter': 'Unlock This Chapter',
  'paywall.title_panel': 'Unlock Premium Content',
  'paywall.title_default': 'Premium Content',
  'paywall.message_default': 'This content requires a subscription or purchase to access.',
  'paywall.close': 'Close',
  'paywall.preview_panels': 'Preview {{count}} panels free',
  'paywall.preview_mode': 'Preview mode: {{mode}}',
  'paywall.choose_option': 'Choose an option:',
  'paywall.type_one_time': 'Buy Once',
  'paywall.type_subscription': 'Subscribe',
  'paywall.type_token': 'Use Token',
  'paywall.type_default': 'Purchase',
  'paywall.sign_in': 'Sign In to Continue',
  'paywall.go_back': 'Go Back',
  'paywall.maybe_later': 'Maybe Later',
  'paywall.secure_payment': 'Secure payment processing',
};

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
    imports: [PwIconComponent],
    templateUrl: './paywall-overlay.component.html',
    styleUrls: ['./paywall-overlay.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaywallOverlayComponent {
  /**
   * Optional: the overlay is a public library component and must keep working
   * (in English) when a host embeds it without ngx-translate.
   */
  private readonly translate = inject(TranslateService, { optional: true });

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
        return this.t('paywall.title_work');
      case 'chapter':
        return this.t('paywall.title_chapter');
      case 'panel':
        return this.t('paywall.title_panel');
      default:
        return this.t('paywall.title_default');
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

    return this.t('paywall.message_default');
  }

  /**
   * Handle purchase option selection: `purchase` carries the product id,
   * `action` is 'subscribe' for a subscription option, else 'purchase'.
   */
  onPurchaseOption(option: PurchaseInfo): void {
    this.purchase.emit(option.productId);
    this.action.emit(option.type === 'subscription' ? 'subscribe' : 'purchase');
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
        return this.t('paywall.type_one_time');
      case 'subscription':
        return this.t('paywall.type_subscription');
      case 'token':
        return this.t('paywall.type_token');
      default:
        return this.t('paywall.type_default');
    }
  }

  /**
   * Translate a built-in UI string. Falls back to the built-in English text
   * (with {{param}} interpolation) when no TranslateService is available or the
   * key is not loaded, so the output never degrades to the raw key.
   * Manifest-provided texts (title/message/gate.reason) bypass this.
   */
  t(key: string, params?: Record<string, string | number | undefined>): string {
    const value = this.translate?.instant(key, params) as unknown;
    if (typeof value === 'string' && value !== key) {
      return value;
    }
    return (PAYWALL_TEXT_EN[key] ?? key).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => String(params?.[name] ?? ''));
  }
}
