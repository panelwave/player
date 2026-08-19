import { test, expect } from '@playwright/test';
import { openPlayer } from './helpers/player';

/**
 * Checklist: "Locale switching works".
 *
 * The sample manifest declares locales ["en-US", "de-DE"]; the toolbar
 * language button (only rendered with >1 locale) opens the language
 * modal, and selecting a locale swaps both the player locale and the
 * UI translation bundle.
 */

test.describe('locale switching', () => {
  test('switches the player UI from English to German', async ({ page }) => {
    await openPlayer(page);

    const languageButton = page.getByRole('button', { name: 'Select language' });
    await expect(languageButton).toContainText('en-US');
    await languageButton.click();

    const dialog = page.locator('.language-container[role="dialog"]');
    await expect(dialog).toBeVisible();
    // Current locale is marked active.
    await expect(page.locator('.language-item.active')).toContainText('en-US');

    await page.locator('.language-item', { hasText: 'de-DE' }).click();
    await expect(dialog).toHaveCount(0);

    // The language button now shows the new locale (its accessible name
    // is localized too), and the translated toolbar labels prove the
    // i18n bundle actually loaded.
    await expect(page.getByRole('button', { name: 'Sprache auswählen' })).toContainText('de-DE');
    await expect(
      page.getByRole('button', { name: 'Zwischen Seiten- und Panelansicht wechseln' })
    ).toContainText('Ansicht');
    await expect(page.getByRole('button', { name: 'Inhaltsverzeichnis öffnen' })).toContainText(
      'Inhalt'
    );
  });

  test('switching back restores English labels', async ({ page }) => {
    await openPlayer(page);

    await page.getByRole('button', { name: 'Select language' }).click();
    await page.locator('.language-item', { hasText: 'de-DE' }).click();

    // The button's accessible name is itself localized after the switch.
    const languageButton = page.getByRole('button', { name: 'Sprache auswählen' });
    await expect(languageButton).toContainText('de-DE');

    await languageButton.click();
    await page.locator('.language-item', { hasText: 'en-US' }).click();
    await expect(page.getByRole('button', { name: 'Select language' })).toContainText('en-US');
    await expect(
      page.getByRole('button', { name: 'Toggle between page and panel view' })
    ).toContainText('View');
  });

  test('localized image alt text follows the locale in page view', async ({ page }) => {
    await openPlayer(page);

    // Page view resolves the asset catalog's localized alt text.
    await page.getByRole('button', { name: 'Toggle between page and panel view' }).click();
    const p11Image = page.locator('.panel-container[data-panel-id="p1-1"] img.layer-image');
    await expect(p11Image).toHaveAttribute('alt', 'Rainy street with reflections.');

    await page.getByRole('button', { name: 'Select language' }).click();
    await page.locator('.language-item', { hasText: 'de-DE' }).click();
    await expect(p11Image).toHaveAttribute('alt', 'Regennasse Straße mit Spiegelungen.');
  });
});
