import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { TranslateLoader, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

import en from '../../../player/src/assets/i18n/en.json';
import de from '../../../player/src/assets/i18n/de.json';

/** The player's UI translations, bundled into main.js (no request at runtime). */
export const BUNDLED_TRANSLATIONS: Record<string, TranslationObject> = { en, de };

/**
 * Bundles the translations instead of fetching assets/i18n/<lang>.json like
 * the demo and the reader: a package opened from disk (file://) cannot fetch.
 * Unknown languages get English.
 */
export class BundledTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<TranslationObject> {
    const base = (lang || 'en').toLowerCase().split('-')[0];
    return of(BUNDLED_TRANSLATIONS[base] ?? BUNDLED_TRANSLATIONS['en']);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    // Only used for the http fallback (panelwave.json); never on file://.
    provideHttpClient(),
    // Explicit loader provider: provideTranslateLoader(Class) mistakes a
    // minified plain class for a factory function in production builds.
    provideTranslateService({ loader: { provide: TranslateLoader, useClass: BundledTranslateLoader } }),
  ],
};
