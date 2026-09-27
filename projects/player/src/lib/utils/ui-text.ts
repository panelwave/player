import type { TranslateService } from '@ngx-translate/core';

/**
 * Translate a built-in UI string. Falls back to the given English text (with
 * `{{param}}` interpolation) when no TranslateService is provided or the key
 * is not loaded, so a public component embedded without ngx-translate never
 * shows a raw key.
 */
export function uiText(
  translate: TranslateService | null,
  key: string,
  english: string | undefined,
  params?: Record<string, unknown>
): string {
  const value = translate?.instant(key, params) as unknown;
  if (typeof value === 'string' && value !== key) {
    return value;
  }
  return (english ?? key).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => String(params?.[name] ?? ''));
}
