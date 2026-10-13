import type { PanelWaveManifest } from 'player';
import {
  DEFAULT_CONFIG,
  chooseLocale,
  isManifestLike,
  localizedText,
  matchLocale,
  normalizeConfig,
  planBoot,
} from './boot';

const manifest = {
  panelwave: { version: '1.6.0' },
  meta: { title: { 'en-US': 'Title', 'de-DE': 'Titel' }, locales: ['en-US', 'de-DE'], default_locale: 'en-US' },
  chapters: [],
} as unknown as PanelWaveManifest;

describe('standalone boot', () => {
  describe('planBoot', () => {
    it('uses the inline manifest and config when panelwave.js set them', () => {
      const plan = planBoot({ PANELWAVE_MANIFEST: manifest, PANELWAVE_CONFIG: { showToolbar: false } }, 'file:');
      expect(plan.kind).toBe('inline');
      if (plan.kind === 'inline') {
        expect(plan.manifest).toBe(manifest);
        expect(plan.config).toEqual({ locale: undefined, showCover: true, showToolbar: false });
      }
    });

    it('fetches on http(s) when there is no inline manifest', () => {
      expect(planBoot({}, 'https:').kind).toBe('fetch');
      expect(planBoot({}, 'http:').kind).toBe('fetch');
    });

    it('reports a missing work on file:// (fetch is blocked there)', () => {
      expect(planBoot({}, 'file:').kind).toBe('missing');
    });

    it('ignores an inline value that is not a manifest', () => {
      expect(planBoot({ PANELWAVE_MANIFEST: { meta: {} } }, 'file:').kind).toBe('missing');
    });
  });

  it('isManifestLike needs meta and a chapters array', () => {
    expect(isManifestLike(manifest)).toBeTrue();
    expect(isManifestLike(null)).toBeFalse();
    expect(isManifestLike({ meta: {}, chapters: {} })).toBeFalse();
  });

  describe('normalizeConfig', () => {
    it('defaults absent or malformed fields', () => {
      expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
      expect(normalizeConfig({ showCover: 'no', locale: 7 })).toEqual({ locale: undefined, showCover: true, showToolbar: true });
    });

    it('keeps valid values', () => {
      expect(normalizeConfig({ locale: 'de-DE', showCover: false, showToolbar: false, extra: 1 })).toEqual({
        locale: 'de-DE',
        showCover: false,
        showToolbar: false,
      });
    });
  });

  it('matchLocale matches exactly, then by language', () => {
    expect(matchLocale('de-DE', ['en-US', 'de-DE'])).toBe('de-DE');
    expect(matchLocale('de-at', ['en-US', 'de-DE'])).toBe('de-DE');
    expect(matchLocale('fr', ['en-US', 'de-DE'])).toBeUndefined();
    expect(matchLocale(null, ['en-US'])).toBeUndefined();
  });

  describe('chooseLocale', () => {
    it('prefers ?locale=, then ?lang=, then the config, then the default', () => {
      expect(chooseLocale(manifest, '?locale=de-DE', { ...DEFAULT_CONFIG, locale: 'en-US' })).toBe('de-DE');
      expect(chooseLocale(manifest, '?lang=de', DEFAULT_CONFIG)).toBe('de-DE');
      expect(chooseLocale(manifest, '', { ...DEFAULT_CONFIG, locale: 'de-DE' })).toBe('de-DE');
      expect(chooseLocale(manifest, '', DEFAULT_CONFIG)).toBe('en-US');
    });

    it('ignores locales the work does not have', () => {
      expect(chooseLocale(manifest, '?locale=fr-FR', { ...DEFAULT_CONFIG, locale: 'it-IT' })).toBe('en-US');
    });
  });

  it('localizedText falls back from locale to default to any value', () => {
    expect(localizedText({ 'en-US': 'A', 'de-DE': 'B' }, 'de-DE', 'en-US')).toBe('B');
    expect(localizedText({ 'en-US': 'A' }, 'de-DE', 'en-US')).toBe('A');
    expect(localizedText({ 'fr-FR': 'C' }, 'de-DE', 'en-US')).toBe('C');
    expect(localizedText('plain', 'de-DE')).toBe('plain');
    expect(localizedText(undefined, 'de-DE')).toBe('');
  });
});
