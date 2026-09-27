/**
 * Age Gate Component
 * Displays age verification UI for restricted content
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

import { FormsModule } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import type { LocaleCode } from '../../../types';
import { PwIconComponent } from '../../icon/pw-icon.component';
import { uiText } from '../../../utils/ui-text';

/**
 * Built-in English UI strings (keys under `age_gate.`), used when no
 * TranslateService is provided or a key is not loaded. Must match the
 * "age_gate" section of assets/i18n/en.json.
 */
const AGE_GATE_TEXT_EN: Record<string, string> = {
  title: 'Age Verification Required',
  close: 'Close',
  warning: 'This content is restricted to users {{age}} years of age or older.',
  prompt: 'Please enter your birth date:',
  month: 'Month',
  day: 'Day',
  year: 'Year',
  verify: 'Verify Age',
  privacy: 'Your information is private and will not be stored.',
  error_incomplete: 'Please enter your complete birth date.',
  error_month: 'Please enter a valid month (1-12).',
  error_day: 'Please enter a valid day (1-{{max}}).',
  error_year: 'Please enter a valid year (1900-{{max}}).',
  error_too_young: 'You must be at least {{age}} years old to access this content.',
};

/**
 * Age verification result
 */
export interface AgeVerificationResult {
  verified: boolean;
  age?: number;
  birthDate?: Date;
}

/**
 * Age Gate Component
 * Modal overlay for age verification
 */
@Component({
    selector: 'pw-age-gate',
    imports: [FormsModule, PwIconComponent],
    templateUrl: './age-gate.component.html',
    styleUrls: ['./age-gate.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgeGateComponent {
  /** Optional: the gate is a public component and works (in English) without ngx-translate. */
  private readonly translate = inject(TranslateService, { optional: true });

  /**
   * Visibility state
   */
  @Input() visible = false;

  /**
   * Minimum required age
   */
  @Input() minimumAge = 18;

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Custom warning message
   */
  @Input() warningMessage?: string;

  /**
   * Allow dismiss
   */
  @Input() allowDismiss = true;

  /**
   * Verification completed
   */
  @Output() verify = new EventEmitter<AgeVerificationResult>();

  /**
   * Close overlay
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Birth date inputs
   */
  birthMonth = '';
  birthDay = '';
  birthYear = '';

  /**
   * Error message
   */
  errorMessage = '';

  /**
   * Handle escape key
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible && this.allowDismiss) {
      this.onDismiss();
    }
  }

  /**
   * Get warning message
   */
  getWarningMessage(): string {
    if (this.warningMessage) {
      return this.warningMessage;
    }
    return this.t('warning', { age: this.minimumAge });
  }

  /** Translate an `age_gate.*` UI string (English fallback). */
  t(key: string, params?: Record<string, unknown>): string {
    return uiText(this.translate, 'age_gate.' + key, AGE_GATE_TEXT_EN[key], params);
  }

  /**
   * Handle verification submit
   */
  onSubmit(): void {
    this.errorMessage = '';

    // Validate inputs
    if (!this.birthMonth || !this.birthDay || !this.birthYear) {
      this.errorMessage = this.t('error_incomplete');
      return;
    }

    const month = parseInt(this.birthMonth, 10);
    const day = parseInt(this.birthDay, 10);
    const year = parseInt(this.birthYear, 10);

    // Validate ranges
    if (month < 1 || month > 12) {
      this.errorMessage = this.t('error_month');
      return;
    }

    if (day < 1 || day > 31) {
      this.errorMessage = this.t('error_day', { max: 31 });
      return;
    }

    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear) {
      this.errorMessage = this.t('error_year', { max: currentYear });
      return;
    }

    // Reject calendar-impossible dates (31 Apr, 30 Feb, 29 Feb in non-leap
    // years): new Date() would silently roll them over into the next month.
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) {
      this.errorMessage = this.t('error_day', { max: daysInMonth });
      return;
    }

    // Calculate age
    const birthDate = new Date(year, month - 1, day);
    const age = this.calculateAge(birthDate);

    if (age < this.minimumAge) {
      this.errorMessage = this.t('error_too_young', { age: this.minimumAge });
      this.verify.emit({
        verified: false,
        age,
        birthDate,
      });
      return;
    }

    // Success
    this.verify.emit({
      verified: true,
      age,
      birthDate,
    });
  }

  /**
   * Handle dismiss
   */
  onDismiss(): void {
    if (this.allowDismiss) {
      this.verify.emit({ verified: false });
      this.close.emit();
    }
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.allowDismiss) {
      this.onDismiss();
    }
  }

  /**
   * Calculate age from birth date
   */
  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  private monthCache?: { locale: string; options: { value: string; label: string }[] };

  /**
   * Month options, named in the current locale (Intl; cached per locale).
   */
  getMonthOptions(): { value: string; label: string }[] {
    if (this.monthCache?.locale !== this.locale) {
      let format: Intl.DateTimeFormat;
      try {
        format = new Intl.DateTimeFormat(this.locale, { month: 'long', timeZone: 'UTC' });
      } catch {
        format = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
      }
      this.monthCache = {
        locale: this.locale,
        options: Array.from({ length: 12 }, (_, index) => ({
          value: String(index + 1),
          label: format.format(Date.UTC(2000, index, 1)),
        })),
      };
    }
    return this.monthCache.options;
  }

  /**
   * Get day options
   */
  getDayOptions(): number[] {
    return Array.from({ length: 31 }, (_, i) => i + 1);
  }

  /**
   * Get year options
   */
  getYearOptions(): number[] {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = currentYear; year >= 1900; year--) {
      years.push(year);
    }
    return years;
  }
}
