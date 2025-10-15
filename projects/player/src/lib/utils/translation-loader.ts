/**
 * Translation Loader
 * Loads translation files via HTTP
 */

import { HttpClient } from '@angular/common/http';
import { TranslateLoader } from '@ngx-translate/core';
import { Observable } from 'rxjs';

/**
 * Custom Translation Loader
 * Loads translations from JSON files via HTTP
 */
export class CustomTranslateLoader implements TranslateLoader {
  constructor(private http: HttpClient) {}

  getTranslation(lang: string): Observable<Record<string, any>> {
    return this.http.get<Record<string, any>>(`./assets/i18n/${lang}.json`);
  }
}
