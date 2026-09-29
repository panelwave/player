/**
 * Translation Service
 * Provides translation functionality for the PanelWave player
 */

import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import type { LocaleCode } from '../types';

/**
 * Translation Service
 * Manages GUI translations and locale switching
 */
@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private readonly translate = inject(TranslateService);

  constructor() {
    // Fallback language - translations will be loaded via HTTP.
    // setFallbackLang / getCurrentLang / getFallbackLang exist in
    // ngx-translate 17 and 18 (the default* aliases are gone in 18).
    this.translate.setFallbackLang('en');
    this.translate.use('en');
  }

  /**
   * Initialize translation service with available languages
   */
  initialize(availableLanguages: string[]): void {
    this.translate.addLangs(availableLanguages);
  }

  /**
   * Set the current GUI language
   */
  setLanguage(lang: string): void {
    // Map locale code (e.g., 'en-US') to language code (e.g., 'en')
    const languageCode = this.getLanguageCode(lang);
    this.translate.use(languageCode);
  }

  /**
   * Get current GUI language
   */
  getCurrentLanguage(): string {
    return this.translate.getCurrentLang() || this.translate.getFallbackLang() || 'en';
  }

  /**
   * Extract language code from locale code
   */
  private getLanguageCode(locale: LocaleCode): string {
    // Extract base language from locale (e.g., 'en-US' -> 'en')
    return locale.split('-')[0];
  }

  /**
   * Get translation for a key
   */
  instant(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }

  /**
   * Get translation observable for a key
   */
  get(key: string, params?: Record<string, unknown>) {
    return this.translate.get(key, params);
  }
}
