/**
 * Text Layer Component
 * Renders text layers with localization and styling
 */

import {
  Component,
  Input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { LocaleCode, LocalizedString } from '../../../types';

/**
 * Text Layer Component
 * Displays localized text with custom styling
 */
@Component({
    selector: 'pw-text-layer',
    imports: [CommonModule],
    templateUrl: './text-layer.component.html',
    styleUrls: ['./text-layer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TextLayerComponent {
  /**
   * Localized text content
   */
  @Input() text: LocalizedString = {};

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Font size in pixels
   */
  @Input() fontSize?: number;

  /**
   * Font family
   */
  @Input() fontFamily?: string;

  /**
   * Font weight
   */
  @Input() fontWeight?: number | string;

  /**
   * Text color
   */
  @Input() color?: string;

  /**
   * Text alignment
   */
  @Input() textAlign?: 'left' | 'center' | 'right' | 'justify';

  /**
   * Line height
   */
  @Input() lineHeight?: number;

  /**
   * Get localized text content
   */
  getTextContent(): string {
    if (!this.text || typeof this.text !== 'object') {
      return '';
    }

    // Try exact locale match
    if (this.text[this.locale]) {
      return this.text[this.locale];
    }

    // Try base language (e.g., 'en' from 'en-US')
    const baseLocale = this.locale.split('-')[0];
    const baseMatch = Object.keys(this.text).find(
      (key) => key.startsWith(baseLocale)
    );
    
    if (baseMatch && this.text[baseMatch]) {
      return this.text[baseMatch];
    }

    // Return first available
    const firstKey = Object.keys(this.text)[0];
    return firstKey ? this.text[firstKey] : '';
  }

  /**
   * Get text styles
   */
  getTextStyles(): Record<string, string> {
    const styles: Record<string, string> = {};

    if (this.fontSize !== undefined) {
      styles['font-size'] = `${this.fontSize}px`;
    }

    if (this.fontFamily) {
      styles['font-family'] = this.fontFamily;
    }

    if (this.fontWeight !== undefined) {
      styles['font-weight'] = `${this.fontWeight}`;
    }

    if (this.color) {
      styles['color'] = this.color;
    }

    if (this.textAlign) {
      styles['text-align'] = this.textAlign;
    }

    if (this.lineHeight !== undefined) {
      styles['line-height'] = `${this.lineHeight}`;
    }

    return styles;
  }
}
