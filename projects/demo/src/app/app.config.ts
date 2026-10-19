import { ApplicationConfig, inject } from '@angular/core';
import { provideHttpClient, HttpClient } from '@angular/common/http';
import { TranslateLoader, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

/**
 * Simple TranslateLoader for demo app
 */
export class DemoTranslateLoader implements TranslateLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<TranslationObject> {
    return this.http.get<TranslationObject>(`./assets/i18n/${lang}.json`);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    // provideTranslateService works with ngx-translate 17 and 18
    // (TranslateModule.forRoot is gone in 18). The loader is an explicit
    // provider: 18's provideTranslateLoader(Class) mistakes a minified plain
    // class for a factory function in production builds.
    provideTranslateService({ loader: { provide: TranslateLoader, useClass: DemoTranslateLoader } }),
  ],
};
