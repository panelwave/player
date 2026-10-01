import { ApplicationConfig, inject } from '@angular/core';
import { provideHttpClient, HttpClient } from '@angular/common/http';
import { TranslateLoader, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

/** Loads the player's bundled UI translations (assets/i18n/<lang>.json). */
export class ReaderTranslateLoader implements TranslateLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<TranslationObject> {
    return this.http.get<TranslationObject>(`./assets/i18n/${lang}.json`);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    // Explicit loader provider: provideTranslateLoader(Class) mistakes a
    // minified plain class for a factory function in production builds.
    provideTranslateService({ loader: { provide: TranslateLoader, useClass: ReaderTranslateLoader } }),
  ],
};
