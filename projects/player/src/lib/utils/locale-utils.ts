/**
 * Locale Utilities
 * Helper functions for handling localized strings and assets
 */

import type { LocalizedString, LocaleCode } from '../types';

/**
 * Resolve a localized string to the best matching locale
 * 
 * @param localizedString - Dictionary of localized strings
 * @param requestedLocale - Desired locale (e.g., "en-US")
 * @param fallbackLocale - Fallback locale (e.g., "en-US")
 * @returns The resolved string, or empty string if no match found
 * 
 * @example
 * ```typescript
 * const title = {
 *   'en-US': 'Hello',
 *   'de-DE': 'Hallo',
 *   'fr-FR': 'Bonjour'
 * };
 * 
 * resolveLocalizedString(title, 'en-GB', 'en-US');
 * // Returns: 'Hello' (falls back to en-US)
 * 
 * resolveLocalizedString(title, 'de-DE', 'en-US');
 * // Returns: 'Hallo' (exact match)
 * ```
 */
export function resolveLocalizedString(
  localizedString: LocalizedString | undefined,
  requestedLocale: LocaleCode,
  fallbackLocale: LocaleCode
): string {
  // Return empty string if no localized string provided
  if (!localizedString || Object.keys(localizedString).length === 0) {
    return '';
  }

  // Try exact match first
  if (localizedString[requestedLocale]) {
    return localizedString[requestedLocale];
  }

  // Try base language match (e.g., "en" from "en-GB")
  const baseLanguage = getBaseLanguage(requestedLocale);
  const baseMatch = Object.keys(localizedString).find(
    (locale) => getBaseLanguage(locale) === baseLanguage
  );
  if (baseMatch && localizedString[baseMatch]) {
    return localizedString[baseMatch];
  }

  // Try fallback locale
  if (localizedString[fallbackLocale]) {
    return localizedString[fallbackLocale];
  }

  // Try base language of fallback
  const fallbackBase = getBaseLanguage(fallbackLocale);
  const fallbackBaseMatch = Object.keys(localizedString).find(
    (locale) => getBaseLanguage(locale) === fallbackBase
  );
  if (fallbackBaseMatch && localizedString[fallbackBaseMatch]) {
    return localizedString[fallbackBaseMatch];
  }

  // Return first available string as last resort
  const firstLocale = Object.keys(localizedString)[0];
  return localizedString[firstLocale] || '';
}

/**
 * Extract base language from a locale code
 * 
 * @param locale - Locale code (e.g., "en-US", "zh-Hans-CN")
 * @returns Base language code (e.g., "en", "zh")
 * 
 * @example
 * ```typescript
 * getBaseLanguage('en-US');  // Returns: 'en'
 * getBaseLanguage('de-DE');  // Returns: 'de'
 * getBaseLanguage('zh-Hans-CN');  // Returns: 'zh'
 * getBaseLanguage('en');  // Returns: 'en'
 * ```
 */
export function getBaseLanguage(locale: LocaleCode): string {
  if (!locale) {
    return '';
  }
  
  // Split on hyphen and return first part
  const parts = locale.split('-');
  return parts[0].toLowerCase();
}

/**
 * Pick the best asset variant for the given locale
 * 
 * @param variants - Array of asset variants with optional locale property
 * @param requestedLocale - Desired locale
 * @param fallbackLocale - Fallback locale
 * @returns The best matching variant, or first variant if no locale match
 * 
 * @example
 * ```typescript
 * const variants = [
 *   { src: 'audio-en.mp3', mime: 'audio/mpeg', locale: 'en-US' },
 *   { src: 'audio-de.mp3', mime: 'audio/mpeg', locale: 'de-DE' },
 *   { src: 'audio.mp3', mime: 'audio/mpeg' }  // No locale (universal)
 * ];
 * 
 * pickLocalizedAsset(variants, 'de-DE', 'en-US');
 * // Returns: { src: 'audio-de.mp3', mime: 'audio/mpeg', locale: 'de-DE' }
 * ```
 */
export function pickLocalizedAsset<T extends { locale?: LocaleCode }>(
  variants: T[],
  requestedLocale: LocaleCode,
  fallbackLocale: LocaleCode
): T | undefined {
  if (!variants || variants.length === 0) {
    return undefined;
  }

  // Try exact locale match
  const exactMatch = variants.find((v) => v.locale === requestedLocale);
  if (exactMatch) {
    return exactMatch;
  }

  // Try base language match
  const baseLanguage = getBaseLanguage(requestedLocale);
  const baseMatch = variants.find(
    (v) => v.locale && getBaseLanguage(v.locale) === baseLanguage
  );
  if (baseMatch) {
    return baseMatch;
  }

  // Try fallback locale
  const fallbackMatch = variants.find((v) => v.locale === fallbackLocale);
  if (fallbackMatch) {
    return fallbackMatch;
  }

  // Try base language of fallback
  const fallbackBase = getBaseLanguage(fallbackLocale);
  const fallbackBaseMatch = variants.find(
    (v) => v.locale && getBaseLanguage(v.locale) === fallbackBase
  );
  if (fallbackBaseMatch) {
    return fallbackBaseMatch;
  }

  // Return variant without locale (universal) if exists
  const universalVariant = variants.find((v) => !v.locale);
  if (universalVariant) {
    return universalVariant;
  }

  // Return first variant as last resort
  return variants[0];
}

/**
 * Check if a locale is supported in the given list
 * 
 * @param locale - Locale to check
 * @param supportedLocales - Array of supported locale codes
 * @returns True if locale is supported (exact or base language match)
 * 
 * @example
 * ```typescript
 * const supported = ['en-US', 'de-DE', 'fr-FR'];
 * 
 * isLocaleSupported('en-US', supported);  // true (exact match)
 * isLocaleSupported('en-GB', supported);  // true (base language match)
 * isLocaleSupported('es-ES', supported);  // false (no match)
 * ```
 */
export function isLocaleSupported(
  locale: LocaleCode,
  supportedLocales: LocaleCode[]
): boolean {
  if (!locale || !supportedLocales || supportedLocales.length === 0) {
    return false;
  }

  // Check exact match
  if (supportedLocales.includes(locale)) {
    return true;
  }

  // Check base language match
  const baseLanguage = getBaseLanguage(locale);
  return supportedLocales.some(
    (supported) => getBaseLanguage(supported) === baseLanguage
  );
}

/**
 * Get completion percentage for localized content
 * 
 * @param localizedStrings - Array of localized string objects
 * @param targetLocale - Locale to check completion for
 * @returns Percentage (0-100) of strings available in target locale
 * 
 * @example
 * ```typescript
 * const strings = [
 *   { 'en-US': 'Hello', 'de-DE': 'Hallo' },
 *   { 'en-US': 'World', 'de-DE': 'Welt' },
 *   { 'en-US': 'Goodbye' }  // Missing de-DE
 * ];
 * 
 * getLocalizationCompleteness(strings, 'de-DE');
 * // Returns: 66.67 (2 out of 3 strings have de-DE)
 * ```
 */
export function getLocalizationCompleteness(
  localizedStrings: LocalizedString[],
  targetLocale: LocaleCode
): number {
  if (!localizedStrings || localizedStrings.length === 0) {
    return 0;
  }

  const total = localizedStrings.length;
  const translated = localizedStrings.filter(
    (str) => str && str[targetLocale]
  ).length;

  return (translated / total) * 100;
}

/**
 * Create a fallback chain for locale resolution
 * 
 * @param requestedLocale - Primary locale
 * @param fallbackLocale - Secondary fallback locale
 * @returns Array of locales to try in order
 * 
 * @example
 * ```typescript
 * createLocaleFallbackChain('en-GB', 'en-US');
 * // Returns: ['en-GB', 'en', 'en-US']
 * 
 * createLocaleFallbackChain('zh-Hans-CN', 'en-US');
 * // Returns: ['zh-Hans-CN', 'zh', 'en-US', 'en']
 * ```
 */
export function createLocaleFallbackChain(
  requestedLocale: LocaleCode,
  fallbackLocale: LocaleCode
): LocaleCode[] {
  const chain: LocaleCode[] = [];
  const seen = new Set<string>();

  // Add requested locale
  if (requestedLocale && !seen.has(requestedLocale)) {
    chain.push(requestedLocale);
    seen.add(requestedLocale);
  }

  // Add base language of requested
  const requestedBase = getBaseLanguage(requestedLocale);
  if (requestedBase && !seen.has(requestedBase)) {
    chain.push(requestedBase);
    seen.add(requestedBase);
  }

  // Add fallback locale
  if (fallbackLocale && !seen.has(fallbackLocale)) {
    chain.push(fallbackLocale);
    seen.add(fallbackLocale);
  }

  // Add base language of fallback
  const fallbackBase = getBaseLanguage(fallbackLocale);
  if (fallbackBase && !seen.has(fallbackBase)) {
    chain.push(fallbackBase);
    seen.add(fallbackBase);
  }

  return chain;
}

/**
 * Normalize locale code to standard format
 * 
 * @param locale - Locale code in any format
 * @returns Normalized locale code (e.g., "en-US")
 * 
 * @example
 * ```typescript
 * normalizeLocaleCode('en_us');  // Returns: 'en-US'
 * normalizeLocaleCode('EN-us');  // Returns: 'en-US'
 * normalizeLocaleCode('en');     // Returns: 'en'
 * ```
 */
export function normalizeLocaleCode(locale: LocaleCode): LocaleCode {
  if (!locale) {
    return '';
  }

  // Replace underscore with hyphen
  const normalized = locale.replace(/_/g, '-');

  // Split into parts
  const parts = normalized.split('-');

  // Lowercase language code
  if (parts.length > 0) {
    parts[0] = parts[0].toLowerCase();
  }

  // Uppercase region code
  if (parts.length > 1) {
    parts[parts.length - 1] = parts[parts.length - 1].toUpperCase();
  }

  return parts.join('-');
}
