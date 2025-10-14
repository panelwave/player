/**
 * Unit tests for locale utilities
 */

import type { LocalizedString } from '../types';
import {
  resolveLocalizedString,
  getBaseLanguage,
  pickLocalizedAsset,
  isLocaleSupported,
  getLocalizationCompleteness,
  createLocaleFallbackChain,
  normalizeLocaleCode,
} from './locale-utils';

describe('LocaleUtils', () => {
  describe('resolveLocalizedString', () => {
    const testStrings = {
      'en-US': 'Hello',
      'en-GB': 'Hello (GB)',
      'de-DE': 'Hallo',
      'fr-FR': 'Bonjour',
    };

    it('should return exact locale match', () => {
      const result = resolveLocalizedString(testStrings, 'en-US', 'en-US');
      expect(result).toBe('Hello');
    });

    it('should return base language match when exact locale not available', () => {
      const result = resolveLocalizedString(testStrings, 'en-CA', 'en-US');
      expect(result).toBe('Hello'); // Falls back to en-US
    });

    it('should return fallback locale when requested not available', () => {
      const result = resolveLocalizedString(testStrings, 'es-ES', 'en-US');
      expect(result).toBe('Hello'); // Falls back to en-US
    });

    it('should return first available when no match found', () => {
      const result = resolveLocalizedString(testStrings, 'ja-JP', 'zh-CN');
      expect(result).toBe('Hello'); // First available (en-US)
    });

    it('should return empty string when no localized strings provided', () => {
      const result = resolveLocalizedString(undefined, 'en-US', 'en-US');
      expect(result).toBe('');
    });

    it('should return empty string when empty object provided', () => {
      const result = resolveLocalizedString({}, 'en-US', 'en-US');
      expect(result).toBe('');
    });

    it('should handle single locale', () => {
      const singleLocale = { 'en-US': 'Test' };
      const result = resolveLocalizedString(singleLocale, 'de-DE', 'fr-FR');
      expect(result).toBe('Test'); // Returns first available
    });
  });

  describe('getBaseLanguage', () => {
    it('should extract base language from simple locale', () => {
      expect(getBaseLanguage('en-US')).toBe('en');
      expect(getBaseLanguage('de-DE')).toBe('de');
      expect(getBaseLanguage('fr-FR')).toBe('fr');
    });

    it('should extract base language from complex locale', () => {
      expect(getBaseLanguage('zh-Hans-CN')).toBe('zh');
      expect(getBaseLanguage('sr-Latn-RS')).toBe('sr');
    });

    it('should return lowercase', () => {
      expect(getBaseLanguage('EN-US')).toBe('en');
      expect(getBaseLanguage('DE-de')).toBe('de');
    });

    it('should handle language-only locale', () => {
      expect(getBaseLanguage('en')).toBe('en');
      expect(getBaseLanguage('de')).toBe('de');
    });

    it('should return empty string for empty input', () => {
      expect(getBaseLanguage('')).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
      expect(getBaseLanguage(null as any)).toBe('');
      expect(getBaseLanguage(undefined as any)).toBe('');
    });
  });

  describe('pickLocalizedAsset', () => {
    interface TestAsset {
      src: string;
      locale?: string;
    }

    const variants: TestAsset[] = [
      { src: 'audio-en.mp3', locale: 'en-US' },
      { src: 'audio-de.mp3', locale: 'de-DE' },
      { src: 'audio-fr.mp3', locale: 'fr-FR' },
      { src: 'audio-universal.mp3' }, // No locale
    ];

    it('should return exact locale match', () => {
      const result = pickLocalizedAsset(variants, 'en-US', 'en-US');
      expect(result?.src).toBe('audio-en.mp3');
    });

    it('should return base language match', () => {
      const result = pickLocalizedAsset(variants, 'en-GB', 'en-US');
      expect(result?.src).toBe('audio-en.mp3');
    });

    it('should return fallback locale', () => {
      const result = pickLocalizedAsset(variants, 'ja-JP', 'de-DE');
      expect(result?.src).toBe('audio-de.mp3');
    });

    it('should return universal variant when no locale match', () => {
      const result = pickLocalizedAsset(variants, 'ja-JP', 'zh-CN');
      expect(result?.src).toBe('audio-universal.mp3');
    });

    it('should return first variant as last resort', () => {
      const noUniversal = variants.filter((v) => v.locale);
      const result = pickLocalizedAsset(noUniversal, 'ja-JP', 'zh-CN');
      expect(result?.src).toBe('audio-en.mp3'); // First in array
    });

    it('should return undefined for empty array', () => {
      const result = pickLocalizedAsset([], 'en-US', 'en-US');
      expect(result).toBeUndefined();
    });

    it('should return undefined for null/undefined input', () => {
      expect(pickLocalizedAsset(null as any, 'en-US', 'en-US')).toBeUndefined();
      expect(pickLocalizedAsset(undefined as any, 'en-US', 'en-US')).toBeUndefined();
    });
  });

  describe('isLocaleSupported', () => {
    const supportedLocales = ['en-US', 'de-DE', 'fr-FR', 'ja-JP'];

    it('should return true for exact match', () => {
      expect(isLocaleSupported('en-US', supportedLocales)).toBe(true);
      expect(isLocaleSupported('de-DE', supportedLocales)).toBe(true);
    });

    it('should return true for base language match', () => {
      expect(isLocaleSupported('en-GB', supportedLocales)).toBe(true);
      expect(isLocaleSupported('de-AT', supportedLocales)).toBe(true);
    });

    it('should return false for unsupported locale', () => {
      expect(isLocaleSupported('es-ES', supportedLocales)).toBe(false);
      expect(isLocaleSupported('zh-CN', supportedLocales)).toBe(false);
    });

    it('should return false for empty locale', () => {
      expect(isLocaleSupported('', supportedLocales)).toBe(false);
    });

    it('should return false for empty supported list', () => {
      expect(isLocaleSupported('en-US', [])).toBe(false);
    });

    it('should handle null/undefined gracefully', () => {
      expect(isLocaleSupported(null as any, supportedLocales)).toBe(false);
      expect(isLocaleSupported('en-US', null as any)).toBe(false);
    });
  });

  describe('getLocalizationCompleteness', () => {
    const strings: LocalizedString[] = [
      { 'en-US': 'Hello', 'de-DE': 'Hallo' },
      { 'en-US': 'World', 'de-DE': 'Welt' },
      { 'en-US': 'Goodbye' }, // Missing de-DE
    ];

    it('should return 100% for fully translated locale', () => {
      const result = getLocalizationCompleteness(strings, 'en-US');
      expect(result).toBe(100);
    });

    it('should return correct percentage for partially translated locale', () => {
      const result = getLocalizationCompleteness(strings, 'de-DE');
      expect(result).toBeCloseTo(66.67, 2); // 2 out of 3
    });

    it('should return 0% for completely missing locale', () => {
      const result = getLocalizationCompleteness(strings, 'fr-FR');
      expect(result).toBe(0);
    });

    it('should return 0 for empty array', () => {
      const result = getLocalizationCompleteness([], 'en-US');
      expect(result).toBe(0);
    });

    it('should handle null/undefined gracefully', () => {
      expect(getLocalizationCompleteness(null as any, 'en-US')).toBe(0);
      expect(getLocalizationCompleteness(undefined as any, 'en-US')).toBe(0);
    });
  });

  describe('createLocaleFallbackChain', () => {
    it('should create chain with all unique locales', () => {
      const chain = createLocaleFallbackChain('en-GB', 'en-US');
      expect(chain).toEqual(['en-GB', 'en', 'en-US']);
    });

    it('should avoid duplicates when base language matches', () => {
      const chain = createLocaleFallbackChain('en-US', 'en-GB');
      expect(chain).toEqual(['en-US', 'en', 'en-GB']);
    });

    it('should handle different language families', () => {
      const chain = createLocaleFallbackChain('de-DE', 'en-US');
      expect(chain).toEqual(['de-DE', 'de', 'en-US', 'en']);
    });

    it('should handle complex locales', () => {
      const chain = createLocaleFallbackChain('zh-Hans-CN', 'en-US');
      expect(chain).toEqual(['zh-Hans-CN', 'zh', 'en-US', 'en']);
    });

    it('should handle same locale for both parameters', () => {
      const chain = createLocaleFallbackChain('en-US', 'en-US');
      expect(chain).toEqual(['en-US', 'en']);
    });
  });

  describe('normalizeLocaleCode', () => {
    it('should normalize underscore to hyphen', () => {
      expect(normalizeLocaleCode('en_US')).toBe('en-US');
      expect(normalizeLocaleCode('de_DE')).toBe('de-DE');
    });

    it('should lowercase language and uppercase region', () => {
      expect(normalizeLocaleCode('EN-us')).toBe('en-US');
      expect(normalizeLocaleCode('De-de')).toBe('de-DE');
    });

    it('should handle already normalized codes', () => {
      expect(normalizeLocaleCode('en-US')).toBe('en-US');
      expect(normalizeLocaleCode('fr-FR')).toBe('fr-FR');
    });

    it('should handle language-only codes', () => {
      expect(normalizeLocaleCode('en')).toBe('en');
      expect(normalizeLocaleCode('EN')).toBe('en');
    });

    it('should handle complex locales', () => {
      expect(normalizeLocaleCode('zh_hans_cn')).toBe('zh-hans-CN');
    });

    it('should return empty string for empty input', () => {
      expect(normalizeLocaleCode('')).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
      expect(normalizeLocaleCode(null as any)).toBe('');
      expect(normalizeLocaleCode(undefined as any)).toBe('');
    });
  });
});
