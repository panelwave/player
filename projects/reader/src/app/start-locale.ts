/**
 * The language a reader starts in. First match wins:
 * 1. `?lang=` in the URL (share links),
 * 2. the boot config's locale (injected by the reader server),
 * 3. the language the reader picked last time on this device,
 * 4. the browser's languages (`navigator.languages`),
 * 5. the work's default locale.
 * Every candidate must be — or match by language — one of the work's locales.
 */
export const LOCALE_STORAGE_KEY = 'pw-reader-locale';

/** The work locale for `wanted`: the exact tag, else the first with the same language (de-AT → de-DE). */
export function matchLocale(wanted: string | null | undefined, available: readonly string[]): string | undefined {
  if (!wanted) return undefined;
  const lower = wanted.toLowerCase();
  const exact = available.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;
  const lang = lower.split('-')[0];
  return available.find((l) => l.toLowerCase().split('-')[0] === lang);
}

export interface StartLocaleInput {
  available: readonly string[];
  defaultLocale: string;
  urlLang?: string | null;
  configLocale?: string;
  remembered?: string | null;
  browser?: readonly string[];
}

export function startLocale(input: StartLocaleInput): string {
  const available = input.available.length ? input.available : [input.defaultLocale];
  for (const candidate of [input.urlLang, input.configLocale, input.remembered, ...(input.browser ?? [])]) {
    const hit = matchLocale(candidate, available);
    if (hit) return hit;
  }
  return input.defaultLocale;
}

/** The remembered choice, or null (storage may be unavailable). */
export function readRememberedLocale(storage: Pick<Storage, 'getItem'> | undefined): string | null {
  try {
    return storage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function rememberLocale(storage: Pick<Storage, 'setItem'> | undefined, locale: string): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode / blocked storage: the choice just isn't remembered.
  }
}
