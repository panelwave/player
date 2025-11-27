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
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import type { LocaleCode } from '../../../types';

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
    imports: [FormsModule],
    templateUrl: './age-gate.component.html',
    styleUrls: ['./age-gate.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgeGateComponent {
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
    return `This content is restricted to users ${this.minimumAge} years of age or older.`;
  }

  /**
   * Handle verification submit
   */
  onSubmit(): void {
    this.errorMessage = '';

    // Validate inputs
    if (!this.birthMonth || !this.birthDay || !this.birthYear) {
      this.errorMessage = 'Please enter your complete birth date.';
      return;
    }

    const month = parseInt(this.birthMonth, 10);
    const day = parseInt(this.birthDay, 10);
    const year = parseInt(this.birthYear, 10);

    // Validate ranges
    if (month < 1 || month > 12) {
      this.errorMessage = 'Please enter a valid month (1-12).';
      return;
    }

    if (day < 1 || day > 31) {
      this.errorMessage = 'Please enter a valid day (1-31).';
      return;
    }

    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear) {
      this.errorMessage = `Please enter a valid year (1900-${currentYear}).`;
      return;
    }

    // Calculate age
    const birthDate = new Date(year, month - 1, day);
    const age = this.calculateAge(birthDate);

    if (age < this.minimumAge) {
      this.errorMessage = `You must be at least ${this.minimumAge} years old to access this content.`;
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

  /**
   * Get month options
   */
  getMonthOptions(): Array<{ value: string; label: string }> {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    return months.map((month, index) => ({
      value: String(index + 1),
      label: month,
    }));
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
