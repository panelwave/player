import { test, expect } from '@playwright/test';
import { openPlayer, expectPanel } from './helpers/player';

/**
 * Checklist: "Autoplay start/stop".
 *
 * Autoplay is toolbar-driven (no keyboard shortcut, and the shell's
 * [autoplay] input is not consulted). By default panels advance on the
 * author's timing, durationMs ?? secondsPerPanel * 1000; a speed the
 * reader picks applies to every panel. Sample durations:
 * p1-1: 3000ms, p1-2: 6000ms, p1-3: 2500ms.
 */

test.describe('autoplay', () => {
  test('starts, advances panels on their durations, and stops', async ({ page }) => {
    test.slow(); // real-time waits: ~13s of autoplay timing on top of the page load
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    const autoplayButton = page.getByRole('button', { name: 'Enable/disable autoplay' });
    await expect(autoplayButton).toHaveAttribute('aria-pressed', 'false');

    await autoplayButton.click();
    await expect(autoplayButton).toHaveAttribute('aria-pressed', 'true');
    await expect(autoplayButton).toHaveClass(/active/);
    // Progress bar and speed controls only exist while autoplay runs.
    await expect(page.locator('.autoplay-progress-bar')).toBeVisible();
    await expect(page.locator('.autoplay-controls')).toBeVisible();
    // The author's timing is the default; it shows the current panel's time.
    await expect(page.locator('.autoplay-controls .control-value')).toContainText('Author');

    // p1-1 advances after ~3s, p1-2 after ~6s more.
    await expectPanel(page, 'p1-2', 6_000);
    await expectPanel(page, 'p1-3', 9_000);

    // Stop: state resets and the panel no longer advances (p1-3 would
    // have advanced after 2.5s if autoplay were still running).
    await autoplayButton.click();
    await expect(autoplayButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.autoplay-progress-bar')).toHaveCount(0);

    await page.waitForTimeout(4_000);
    await expectPanel(page, 'p1-3');
  });

  test('speed controls switch to the reader’s speed and back to the author’s timing', async ({ page }) => {
    await openPlayer(page);

    await page.getByRole('button', { name: 'Enable/disable autoplay' }).click();
    const value = page.locator('.autoplay-controls .control-value');
    await expect(value).toContainText('Author');

    await page.getByRole('button', { name: 'Increase speed' }).click();
    await expect(value).not.toContainText('Author');
    const picked = parseFloat((await value.textContent()) ?? '');
    expect(picked).toBeGreaterThan(0);

    const decrease = page.getByRole('button', { name: 'Decrease speed' });
    await decrease.click();
    await decrease.click();
    await expect(value).toHaveText(`${Math.max(0.5, picked - 2)}s`);

    await page.getByRole('button', { name: "Use the author's panel timing" }).click();
    await expect(value).toContainText('Author');
  });
});
