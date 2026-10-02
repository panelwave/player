import type { PanelWaveManifest } from '../types';
import { workLocales } from './work-locales';

describe('workLocales', () => {
  const manifest = (parts: Record<string, unknown>): PanelWaveManifest => parts as unknown as PanelWaveManifest;

  it('lists meta.locales first', () => {
    expect(workLocales(manifest({ meta: { locales: ['en-US', 'de-DE'] }, chapters: [] }))).toEqual(['en-US', 'de-DE']);
  });

  it('adds languages that only the content carries', () => {
    const m = manifest({
      meta: { locales: ['en-US'] },
      chapters: [
        {
          panels: {
            p1: {
              layers: [{ kind: 'text', id: 't', text: { 'en-US': 'Hi', 'fr-FR': 'Salut' } }],
              speechBubbles: [{ id: 'b', text: { 'en-US': 'Hello', 'de-DE': 'Hallo', 'es-ES': '' } }],
            },
          },
        },
      ],
    });
    expect(workLocales(m)).toEqual(['en-US', 'de-DE', 'fr-FR']);
  });

  it('adds the active locales of the localization block', () => {
    const m = manifest({
      meta: { locales: ['en-US'] },
      localization: { locales: [{ code: 'en-US', isDefault: true }, { code: 'it-IT', isActive: true }, { code: 'nl-NL', isActive: false }] },
      chapters: [],
    });
    expect(workLocales(m)).toEqual(['en-US', 'it-IT']);
  });

  it('leaves out a bare language code when a regioned locale of it is listed', () => {
    const m = manifest({
      meta: { locales: ['en-US'] },
      chapters: [{ panels: { p1: { speechBubbles: [{ id: 'b', text: { en: 'Hello', 'de-DE': 'Hallo', fr: 'Salut' } }] } } }],
    });
    expect(workLocales(m)).toEqual(['en-US', 'de-DE', 'fr']);
  });

  it('falls back to en-US', () => {
    expect(workLocales(null)).toEqual(['en-US']);
    expect(workLocales(manifest({ meta: {}, chapters: [] }))).toEqual(['en-US']);
  });
});
