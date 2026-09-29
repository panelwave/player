/**
 * Language Selection Modal Component
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import { PwIconComponent } from '../../icon/pw-icon.component';
import type { LocaleCode } from '../../../types';

/**
 * Language Selection Modal
 * Allows users to select the interface language
 */
@Component({
    selector: 'pw-language-modal',
    imports: [TranslatePipe, PwIconComponent],
    templateUrl: './language-modal.component.html',
    styleUrls: ['./language-modal.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LanguageModalComponent {
  /**
   * Modal visibility
   */
  @Input() visible = false;

  /**
   * Current locale
   */
  @Input() currentLocale: LocaleCode = 'en-US';

  /**
   * Available locales
   */
  @Input() availableLocales: LocaleCode[] = [];

  /**
   * Close modal
   */
  @Output() closeModal = new EventEmitter<void>();

  /**
   * Locale selected
   */
  @Output() localeSelected = new EventEmitter<LocaleCode>();

  /**
   * Handle locale selection
   */
  onSelectLocale(locale: LocaleCode): void {
    this.localeSelected.emit(locale);
    this.closeModal.emit();
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal.emit();
    }
  }

  /**
   * Handle escape key
   */
  onBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeModal.emit();
    }
  }
}
