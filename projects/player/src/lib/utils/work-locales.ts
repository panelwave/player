/**
 * The languages a work can be read in — what the toolbar's language switch
 * offers. `meta.locales` alone is not enough: works get translated (bubble
 * text maps, the CMS localization block) without that list being updated.
 */
import type { LocaleCode, PanelWaveManifest } from '../types';

const LOCALE = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;

/**
 * `meta.locales` first, then the active locales of the `localization` block,
 * then every locale with text in a speech bubble or text layer. A bare
 * language code (`en`) is left out when a regioned locale of that language
 * (`en-US`) is listed — the text resolves to it by base language. Never
 * empty (falls back to `en-US`).
 */
export function workLocales(manifest: PanelWaveManifest | null | undefined): LocaleCode[] {
  const found = new Set<LocaleCode>();
  const add = (code: unknown): void => {
    if (typeof code === 'string' && LOCALE.test(code)) {
      found.add(code);
    }
  };
  const addTextKeys = (text: unknown): void => {
    if (text && typeof text === 'object') {
      for (const [code, value] of Object.entries(text as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim()) {
          add(code);
        }
      }
    }
  };

  for (const code of manifest?.meta?.locales ?? []) {
    add(code);
  }

  const localization = (manifest as { localization?: { locales?: unknown } } | null | undefined)?.localization;
  if (Array.isArray(localization?.locales)) {
    for (const entry of localization.locales as { code?: unknown; isActive?: unknown }[]) {
      if (entry && entry.isActive !== false) {
        add(entry.code);
      }
    }
  }

  for (const chapter of manifest?.chapters ?? []) {
    for (const panel of Object.values(chapter.panels ?? {})) {
      for (const bubble of panel?.speechBubbles ?? []) {
        addTextKeys(bubble?.text);
      }
      for (const layer of panel?.layers ?? []) {
        if (layer?.kind === 'text') {
          addTextKeys((layer as { text?: unknown }).text);
        }
      }
    }
  }

  const all = [...found];
  const regioned = new Set(all.filter((code) => code.includes('-')).map((code) => code.split('-')[0].toLowerCase()));
  const locales = all.filter((code) => code.includes('-') || !regioned.has(code.toLowerCase()));
  return locales.length > 0 ? locales : ['en-US'];
}
