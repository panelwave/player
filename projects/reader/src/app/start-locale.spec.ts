import { LOCALE_STORAGE_KEY, matchLocale, readRememberedLocale, rememberLocale, startLocale } from './start-locale';

describe('start locale', () => {
  const work = { available: ['en-US', 'de-DE'], defaultLocale: 'en-US' };

  it('matches the exact tag, then the language', () => {
    expect(matchLocale('de-DE', work.available)).toBe('de-DE');
    expect(matchLocale('de-at', work.available)).toBe('de-DE');
    expect(matchLocale('de', work.available)).toBe('de-DE');
    expect(matchLocale('fr-FR', work.available)).toBeUndefined();
    expect(matchLocale(null, work.available)).toBeUndefined();
  });

  it('follows the browser languages, else the default locale', () => {
    expect(startLocale({ ...work, browser: ['de-AT', 'en'] })).toBe('de-DE');
    expect(startLocale({ ...work, browser: ['fr-FR', 'en-GB'] })).toBe('en-US');
    expect(startLocale({ ...work, browser: ['fr-FR'] })).toBe('en-US');
  });

  it('a remembered choice beats the browser; ?lang= beats everything', () => {
    expect(startLocale({ ...work, browser: ['de-DE'], remembered: 'en-US' })).toBe('en-US');
    expect(startLocale({ ...work, browser: ['en-US'], remembered: 'en-US', urlLang: 'de' })).toBe('de-DE');
  });

  it("the server's locale (the work default) only applies when nothing else matches", () => {
    expect(startLocale({ ...work, browser: ['de-AT'], configLocale: 'en-US' })).toBe('de-DE');
    expect(startLocale({ ...work, defaultLocale: 'en-US', browser: ['fr-FR'], configLocale: 'de-DE' })).toBe('de-DE');
  });

  it('ignores candidates the work does not have', () => {
    expect(startLocale({ ...work, urlLang: 'ja-JP', remembered: 'fr-FR', browser: ['de-CH'] })).toBe('de-DE');
    expect(startLocale({ available: [], defaultLocale: 'en-US', browser: ['de-DE'] })).toBe('en-US');
  });

  it('remembers the choice in storage and survives blocked storage', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    rememberLocale(storage, 'de-DE');
    expect(store.get(LOCALE_STORAGE_KEY)).toBe('de-DE');
    expect(readRememberedLocale(storage)).toBe('de-DE');
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readRememberedLocale(blocked)).toBeNull();
    expect(() => rememberLocale(blocked, 'de-DE')).not.toThrow();
    expect(readRememberedLocale(undefined)).toBeNull();
  });
});
