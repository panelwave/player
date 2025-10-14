/**
 * Content Warning Overlay Component
 * Displays content warnings with blur overlay and user controls
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
 * Content warning definition
 */
export interface ContentWarning {
  id: string;
  label: LocalizedString;
  severity?: 'low' | 'medium' | 'high';
}

/**
 * Warning preference
 */
export interface WarningPreference {
  warningId: string;
  alwaysHide: boolean;
}

/**
 * Content Warning Overlay Component
 * Overlays content with warnings and user controls
 */
@Component({
  selector: 'pw-content-warning-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './content-warning-overlay.component.html',
  styleUrls: ['./content-warning-overlay.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentWarningOverlayComponent {
  /**
   * Content warnings to display
   */
  @Input() warnings: ContentWarning[] = [];

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Visible state (controlled by parent)
   */
  @Input() visible = false;

  /**
   * User preferences for warnings
   */
  @Input() preferences: WarningPreference[] = [];

  /**
   * View anyway (dismiss temporarily)
   */
  @Output() viewAnyway = new EventEmitter<void>();

  /**
   * Always hide this warning type
   */
  @Output() alwaysHide = new EventEmitter<string>();

  /**
   * Preference updated
   */
  @Output() preferenceUpdate = new EventEmitter<WarningPreference>();

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
   * Get warning label
   */
  getWarningLabel(warning: ContentWarning): string {
    return this.getLocalizedString(warning.label) || warning.id;
  }

  /**
   * Get severity color
   */
  getSeverityClass(warning: ContentWarning): string {
    switch (warning.severity) {
      case 'high':
        return 'severity-high';
      case 'medium':
        return 'severity-medium';
      case 'low':
        return 'severity-low';
      default:
        return 'severity-medium';
    }
  }

  /**
   * Get severity icon
   */
  getSeverityIcon(warning: ContentWarning): string {
    switch (warning.severity) {
      case 'high':
        return '🔴';
      case 'medium':
        return '⚠️';
      case 'low':
        return 'ℹ️';
      default:
        return '⚠️';
    }
  }

  /**
   * Check if warning should be hidden
   */
  isWarningHidden(warning: ContentWarning): boolean {
    return this.preferences.some(
      (pref) => pref.warningId === warning.id && pref.alwaysHide
    );
  }

  /**
   * Get visible warnings (not hidden by preferences)
   */
  getVisibleWarnings(): ContentWarning[] {
    return this.warnings.filter((warning) => !this.isWarningHidden(warning));
  }

  /**
   * View content anyway (dismiss overlay)
   */
  onViewAnyway(): void {
    this.viewAnyway.emit();
  }

  /**
   * Always hide specific warning
   */
  onAlwaysHide(warning: ContentWarning): void {
    this.alwaysHide.emit(warning.id);
    
    // Update preference
    this.preferenceUpdate.emit({
      warningId: warning.id,
      alwaysHide: true,
    });

    // If no more visible warnings, auto-dismiss
    if (this.getVisibleWarnings().length === 1) {
      this.viewAnyway.emit();
    }
  }

  /**
   * Check if should show overlay
   */
  shouldShow(): boolean {
    return this.visible && this.getVisibleWarnings().length > 0;
  }
}
