/**
 * Translation Service
 * Provides translation functionality for the PanelWave player
 */

import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import type { LocaleCode } from '../types';
import { TRANSLATIONS } from './translations';

/**
 * Translation Service
 * Manages GUI translations and locale switching
 */
@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  constructor(private translate: TranslateService) {
    // Set up translations from bundled data
    this.translate.setTranslation('en', TRANSLATIONS.en);
    this.translate.setTranslation('de', TRANSLATIONS.de);
    this.translate.setDefaultLang('en');
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
    return this.translate.currentLang || this.translate.defaultLang || 'en';
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
