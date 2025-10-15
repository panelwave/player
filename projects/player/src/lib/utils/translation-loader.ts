/**
 * Translation Loader Factory
 * Creates a custom translation loader for the player library
 */

import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

// Import translation files directly
import * as enTranslations from '../assets/i18n/en.json';
import * as deTranslations from '../assets/i18n/de.json';

/**
 * Custom Translation Loader
 * Loads translations from bundled JSON files
 */
export class CustomTranslateLoader implements TranslateLoader {
  private translations: Record<string, unknown> = {
    'en': enTranslations,
    'de': deTranslations,
  };

  getTranslation(lang: string): Observable<unknown> {
    return of(this.translations[lang] || this.translations['en']);
  }
}
