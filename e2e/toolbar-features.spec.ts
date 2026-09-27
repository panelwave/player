import { test, expect, Page } from '@playwright/test';
import { openPlayer, expectPanel, stubManifest } from './helpers/player';

/**
 * Checklist (Final Verification): speech bubbles show/hide, the audio / SFX
 * / speech toggles, thumbnail and table-of-contents navigation, and settings
 * that persist across a reload.
 */

const toolbarButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** The demo sample manifest with one speech bubble on the entry panel. */
async function manifestWithBubble(page: Page): Promise<unknown> {
  const response = await page.request.get('/assets/sample-manifest.json');
  const manifest = await response.json();
  manifest.chapters[0].panels['p1-1'].speechBubbles = [
    {
      id: 'b-e2e',
      text: { 'en-US': 'Somebody call the detective.', 'de-DE': 'Ruft den Detektiv.' },
      shape: { x: 0.08, y: 0.08, w: 0.35, h: 0.18 },
      tail: { x: 0.2, y: 0.4 },
    },
  ];
  return manifest;
}

test.describe('toolbar features', () => {
  test('the speech toggle hides and shows the speech bubbles', async ({ page }) => {
    await stubManifest(page, await manifestWithBubble(page));
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    const bubbles = page.locator('.speech-bubble-wrapper');
    await expect(bubbles).toHaveCount(1);

    const toggle = toolbarButton(page, 'Show/hide speech bubbles');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(bubbles).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(bubbles).toHaveCount(1);
  });

  test('audio and SFX toggles flip and survive a reload', async ({ page }) => {
    await openPlayer(page);

    const audio = toolbarButton(page, 'Mute/unmute audio');
    const sfx = toolbarButton(page, 'Enable/disable sound effects');
    await expect(audio).toHaveAttribute('aria-pressed', 'true');
    await expect(sfx).toHaveAttribute('aria-pressed', 'true');

    await audio.click();
    await sfx.click();
    await expect(audio).toHaveAttribute('aria-pressed', 'false');
    await expect(sfx).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await expect(page.locator('pw-player-shell .player-content')).toBeVisible({ timeout: 30_000 });
    await expect(toolbarButton(page, 'Mute/unmute audio')).toHaveAttribute('aria-pressed', 'false');
    await expect(toolbarButton(page, 'Enable/disable sound effects')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a thumbnail navigates to its panel', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    await toolbarButton(page, 'Show/hide thumbnail strip').click();
    await page.getByRole('button', { name: 'Panel p1-3' }).click();
    await expectPanel(page, 'p1-3');
  });

  test('the table of contents navigates to a panel on another page', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    await toolbarButton(page, 'Open table of contents').click();
    const toc = page.getByRole('dialog', { name: 'Table of Contents' });
    await expect(toc).toBeVisible();

    // Page 2's first panel is the sixth card (pages hold p1-1..p1-5, p2-1..).
    await toc.locator('.panel-card').nth(5).click();
    await expectPanel(page, 'p2-1');
    await expect(toc).toBeHidden();
  });

  test('ToC and thumbnails list the work when it is loaded via manifestUrl', async ({ page }) => {
    // ?byUrl=1: the shell fetches the manifest itself (manifestUrl input).
    await openPlayer(page, '?byUrl=1');
    await expectPanel(page, 'p1-1');

    await toolbarButton(page, 'Open table of contents').click();
    const toc = page.getByRole('dialog', { name: 'Table of Contents' });
    await expect(toc.locator('.chapter-item').first()).toBeVisible();
    await toc.locator('.panel-card').nth(5).click();
    await expectPanel(page, 'p2-1');

    await toolbarButton(page, 'Show/hide thumbnail strip').click();
    await page.getByRole('button', { name: 'Panel p1-3' }).click();
    await expectPanel(page, 'p1-3');
  });

  test('settings are saved and persist across a reload', async ({ page }) => {
    await openPlayer(page);

    await toolbarButton(page, 'Open settings').click();
    const manga = page.getByRole('checkbox', { name: /Manga Mode/ });
    await expect(manga).not.toBeChecked();
    await manga.check();
    await page.getByRole('button', { name: 'Save Changes' }).click();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pw-preferences') ?? '{}'));
    expect(stored.mangaMode).toBe(true);

    await page.reload();
    await expect(page.locator('pw-player-shell .player-content')).toBeVisible({ timeout: 30_000 });
    await toolbarButton(page, 'Open settings').click();
    await expect(page.getByRole('checkbox', { name: /Manga Mode/ })).toBeChecked();
  });
});
