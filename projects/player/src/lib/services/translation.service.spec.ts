/**
 * Unit tests for TranslationService (thin wrapper around ngx-translate)
 */

import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { TranslationService } from './translation.service';

describe('TranslationService', () => {
  describe('with the real ngx-translate service', () => {
    let service: TranslationService;
    let translate: TranslateService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideTranslateService()],
      });
      translate = TestBed.inject(TranslateService);
      translate.setTranslation('en', {
        greeting: 'Hello {{name}}',
        toolbar: { view: 'View' },
      });
      translate.setTranslation('de', {
        greeting: 'Hallo {{name}}',
        toolbar: { view: 'Ansicht' },
      });
      service = TestBed.inject(TranslationService);
    });

    it('defaults to English as both fallback and current language', () => {
      expect(translate.getFallbackLang()).toBe('en');
      expect(translate.getCurrentLang()).toBe('en');
      expect(service.getCurrentLanguage()).toBe('en');
    });

    it('initialize registers the available languages', () => {
      service.initialize(['en', 'de', 'fr']);
      expect([...translate.getLangs()]).toEqual(jasmine.arrayContaining(['en', 'de', 'fr']));
    });

    it('setLanguage maps a BCP-47 locale to its base language code', () => {
      service.setLanguage('de-DE');
      expect(service.getCurrentLanguage()).toBe('de');
      expect(service.instant('toolbar.view')).toBe('Ansicht');
    });

    it('setLanguage accepts a bare language code', () => {
      service.setLanguage('de');
      expect(service.getCurrentLanguage()).toBe('de');
      service.setLanguage('en-US');
      expect(service.getCurrentLanguage()).toBe('en');
    });

    it('instant interpolates parameters', () => {
      expect(service.instant('greeting', { name: 'Ada' })).toBe('Hello Ada');
      service.setLanguage('de-AT');
      expect(service.instant('greeting', { name: 'Ada' })).toBe('Hallo Ada');
    });

    it('instant returns the key for missing translations', () => {
      expect(service.instant('does.not.exist')).toBe('does.not.exist');
    });

    it('get returns an observable of the translated string', async () => {
      await expectAsync(firstValueFrom(service.get('greeting', { name: 'Bob' }))).toBeResolvedTo('Hello Bob');
      service.setLanguage('de-DE');
      await expectAsync(firstValueFrom(service.get('toolbar.view'))).toBeResolvedTo('Ansicht');
    });
  });

  describe('getCurrentLanguage fallbacks', () => {
    interface FakeTranslate {
      currentLang: string;
      defaultLang: string | null;
      setDefaultLang: jasmine.Spy;
      use: jasmine.Spy;
    }
    let fake: FakeTranslate;
    let service: TranslationService;

    beforeEach(() => {
      fake = {
        currentLang: '',
        defaultLang: null,
        setDefaultLang: jasmine.createSpy('setDefaultLang'),
        use: jasmine.createSpy('use'),
      };
      TestBed.configureTestingModule({
        providers: [{ provide: TranslateService, useValue: fake }],
      });
      service = TestBed.inject(TranslationService);
    });

    it('configures English as default and active language on construction', () => {
      expect(fake.setDefaultLang).toHaveBeenCalledWith('en');
      expect(fake.use).toHaveBeenCalledWith('en');
    });

    it('prefers currentLang, then defaultLang, then "en"', () => {
      expect(service.getCurrentLanguage()).toBe('en');
      fake.defaultLang = 'fr';
      expect(service.getCurrentLanguage()).toBe('fr');
      fake.currentLang = 'it';
      expect(service.getCurrentLanguage()).toBe('it');
    });
  });
});
