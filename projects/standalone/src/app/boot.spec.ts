import type { PanelWaveManifest } from 'player';
import {
  DEFAULT_CONFIG,
  chooseLocale,
  embedParamsFromSearch,
  isManifestLike,
  localizedText,
  matchLocale,
  normalizeConfig,
  pageIdFromSearch,
  panelIdFromSearch,
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

    it('keeps the view options and drops malformed ones', () => {
      expect(normalizeConfig({ pageFormat: 'a4-portrait', viewMode: 'page', reducedMotion: true })).toEqual({
        locale: undefined, showCover: true, showToolbar: true,
        pageFormat: 'a4-portrait', viewMode: 'page', reducedMotion: true,
      });
      expect(normalizeConfig({ pageFormat: 'A4 <x>', viewMode: 'grid', reducedMotion: 'yes' })).toEqual({ locale: undefined, showCover: true, showToolbar: true });
    });

    it('print implies a static page view without cover or toolbar', () => {
      expect(normalizeConfig({ print: true, showCover: true, showToolbar: true, viewMode: 'panel', pageFormat: 'a4-portrait' })).toEqual({
        locale: undefined, showCover: false, showToolbar: false,
        pageFormat: 'a4-portrait', viewMode: 'page', reducedMotion: true, print: true,
      });
      expect(normalizeConfig({ print: 'yes' }).print).toBeUndefined();
    });

    it('keeps valid print options for the widget cards, only with print', () => {
      const config = normalizeConfig({
        print: true,
        printOptions: { widgets: 'qr', linkBase: 'https://read.panelwave.org/acme/w', attachments: { 'file-1': 4, bad: -1, worse: 'x' } },
      });
      expect(config.printOptions).toEqual({ widgets: 'qr', linkBase: 'https://read.panelwave.org/acme/w', attachments: { 'file-1': 4 } });
      expect(normalizeConfig({ print: true, printOptions: { widgets: 'all', linkBase: 'javascript:x' } }).printOptions).toBeUndefined();
      expect(normalizeConfig({ printOptions: { widgets: 'hide' } }).printOptions).toBeUndefined();
    });
  });

  it('pageIdFromSearch reads ?page= and rejects malformed ids', () => {
    expect(pageIdFromSearch('?page=pg-A3')).toBe('pg-A3');
    expect(pageIdFromSearch('?locale=de&page=pg-A12')).toBe('pg-A12');
    expect(pageIdFromSearch('')).toBeUndefined();
    expect(pageIdFromSearch('?page=')).toBeUndefined();
    expect(pageIdFromSearch('?page=%3Cscript%3E')).toBeUndefined();
  });

  it('panelIdFromSearch reads ?panel= and rejects malformed ids', () => {
    expect(panelIdFromSearch('?panel=E014')).toBe('E014');
    expect(panelIdFromSearch('?locale=de&panel=p-3')).toBe('p-3');
    expect(panelIdFromSearch('?page=pg-1')).toBeUndefined();
    expect(panelIdFromSearch('?panel=%3Cscript%3E')).toBeUndefined();
  });

  it('matchLocale matches exactly, then by language', () => {
    expect(matchLocale('de-DE', ['en-US', 'de-DE'])).toBe('de-DE');
    expect(matchLocale('de-at', ['en-US', 'de-DE'])).toBe('de-DE');
    expect(matchLocale('fr', ['en-US', 'de-DE'])).toBeUndefined();
    expect(matchLocale(null, ['en-US'])).toBeUndefined();
  });

  describe('chapter embeds', () => {
    it('normalizeConfig keeps a valid chapters map only', () => {
      const config = normalizeConfig({
        chapters: {
          'ch-1': { autoplay: true, poster: 'assets/p1.webp' },
          'ch-2': { autoplay: 'yes', poster: 'javascript:alert(1)' },
          'bad key!': { autoplay: true },
          'ch-3': 'nope',
        },
      });
      expect(config.chapters).toEqual({ 'ch-1': { autoplay: true, poster: 'assets/p1.webp' }, 'ch-2': {} });
      expect(normalizeConfig({ chapters: [] }).chapters).toBeUndefined();
    });

    it('embedParamsFromSearch reads the URL', () => {
      expect(
        embedParamsFromSearch('?embed=1&origin=https%3A%2F%2Fcourse.example%2Fx&chapter=ch-2&autoplay=0&toolbar=1&cover=0&spp=4', DEFAULT_CONFIG)
      ).toEqual({
        embed: true,
        origin: 'https://course.example',
        chapter: 'ch-2',
        autoplay: false,
        showToolbar: true,
        showCover: false,
        secondsPerPanel: 4,
      });
      expect(embedParamsFromSearch('', DEFAULT_CONFIG)).toEqual({ embed: false });
    });

    it('autoplay falls back to the chapter default of the config', () => {
      const config = normalizeConfig({ chapters: { 'ch-2': { autoplay: true } } });
      expect(embedParamsFromSearch('?chapter=ch-2', config).autoplay).toBeTrue();
      expect(embedParamsFromSearch('?chapter=ch-2&autoplay=0', config).autoplay).toBeFalse();
      expect(embedParamsFromSearch('?chapter=ch-1', config).autoplay).toBeUndefined();
    });

    it('rejects a malformed chapter and origin', () => {
      expect(embedParamsFromSearch('?chapter=%3Cx%3E&origin=file%3A%2F%2F%2Fc', DEFAULT_CONFIG)).toEqual({ embed: false });
    });
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
