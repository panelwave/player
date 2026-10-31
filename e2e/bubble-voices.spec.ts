import { test, expect, type Page } from '@playwright/test';
import { openPlayer, expectPanel, stubManifest } from './helpers/player';
import { bubbleVoicesManifest, VOICE_SRC } from './fixtures/bubble-voices-manifest';

/**
 * Spoken lines (format 1.12): a balloon's `audioAssetId` plays when the
 * balloon appears — with the panel, or at its `showAtMs` — one line after
 * another; the reader's language picks the variant; the Voices toggle
 * silences and restarts them; the Speech toggle hides the balloons while
 * the voices go on.
 *
 * Playback is observed, not heard: `HTMLMediaElement.play` is stubbed to
 * record the element's `src` and to fire `ended` shortly after, which is
 * what moves the queue on.
 */
declare global {
  interface Window {
    __voicePlays?: string[];
  }
}

const LINE_MS = 120;

async function observePlayback(page: Page): Promise<void> {
  await page.addInitScript((lineMs: number) => {
    window.__voicePlays = [];
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      window.__voicePlays!.push(this.currentSrc || this.src);
      setTimeout(() => this.dispatchEvent(new Event('ended')), lineMs);
      return Promise.resolve();
    };
  }, LINE_MS);
}

/** The recorded plays as short tags (the data URIs are long). */
async function plays(page: Page): Promise<string[]> {
  const tags: Record<string, string> = {
    [VOICE_SRC.nowEn]: 'now-en',
    [VOICE_SRC.nowDe]: 'now-de',
    [VOICE_SRC.laterEn]: 'later-en',
    [VOICE_SRC.laterDe]: 'later-de',
    [VOICE_SRC.hall]: 'hall',
  };
  const raw = await page.evaluate(() => window.__voicePlays ?? []);
  return raw.map((src) => tags[src] ?? src.slice(0, 40));
}

const balloon = (page: Page, id: string) => page.locator(`.t-frame .speech-bubble-wrapper[data-bubble-id="${id}"]`);
const toolbarButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function showToolbar(page: Page): Promise<void> {
  if (!(await page.locator('.toolbar-container.visible').count())) {
    await page.keyboard.press('t');
  }
  await expect(toolbarButton(page, "Hear/mute the characters' voices")).toBeVisible();
}

test.describe('spoken lines', () => {
  test.beforeEach(async ({ page }) => {
    await observePlayback(page);
  });

  test('plays the lines of a panel as its balloons appear, one after another', async ({ page }) => {
    await stubManifest(page, bubbleVoicesManifest());
    await openPlayer(page);
    await expectPanel(page, 'pGate');

    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en']);
    await expect(balloon(page, 'b-later')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en']);

    // The next panel speaks its own line; the quiet one nothing.
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'pHall');
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en', 'hall']);
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'pQuiet');
    await page.waitForTimeout(400);
    expect(await plays(page)).toEqual(['now-en', 'later-en', 'hall']);
  });

  test('the reader\'s language picks the variant and a switch re-reads the panel', async ({ page }) => {
    await stubManifest(page, bubbleVoicesManifest());
    await openPlayer(page);
    await expectPanel(page, 'pGate');
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en']);

    await showToolbar(page);
    await toolbarButton(page, 'Select language').click();
    await page.locator('.language-item', { hasText: 'de-DE' }).click();
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en', 'now-de', 'later-de']);
  });

  test('the Voices toggle silences the lines; Speech off hides the balloons but keeps the voices', async ({ page }) => {
    await stubManifest(page, bubbleVoicesManifest());
    await openPlayer(page);
    await expectPanel(page, 'pGate');
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en']);
    await showToolbar(page);

    const voices = toolbarButton(page, "Hear/mute the characters' voices");
    await expect(voices).toHaveAttribute('aria-pressed', 'true');
    await voices.click();
    await expect(voices).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, 'pHall');
    await page.waitForTimeout(400);
    expect(await plays(page)).toEqual(['now-en', 'later-en']); // silent

    await voices.click(); // on again: the shown panel is read
    await expect(voices).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en', 'hall']);

    // Listen without reading: Speech off hides the balloons, the line still plays.
    await toolbarButton(page, 'Show/hide speech bubbles').click();
    await expect(page.locator('.t-frame .speech-bubble-wrapper')).toHaveCount(0);
    await page.keyboard.press('ArrowLeft');
    await expectPanel(page, 'pGate');
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en', 'hall', 'now-en', 'later-en']);
    await expect(page.locator('.t-frame .speech-bubble-wrapper')).toHaveCount(0);

    // The preference survives a reload.
    await page.reload();
    await expectPanel(page, 'pGate');
    await showToolbar(page);
    await expect(toolbarButton(page, 'Show/hide speech bubbles')).toHaveAttribute('aria-pressed', 'false');
    await expect(toolbarButton(page, "Hear/mute the characters' voices")).toHaveAttribute('aria-pressed', 'true');
  });

  test('without settings.ui.voicesDefault the voices start off (the format default)', async ({ page }) => {
    await stubManifest(page, bubbleVoicesManifest({ voicesDefault: 'omit' }));
    await openPlayer(page);
    await expectPanel(page, 'pGate');
    await expect(balloon(page, 'b-later')).toBeVisible({ timeout: 5000 });
    expect(await plays(page)).toEqual([]);
    await showToolbar(page);
    await expect(toolbarButton(page, "Hear/mute the characters' voices")).toHaveAttribute('aria-pressed', 'false');
  });

  test('settings.ui.voicesDefault false starts silent until the reader turns voices on', async ({ page }) => {
    await stubManifest(page, bubbleVoicesManifest({ voicesDefault: false }));
    await openPlayer(page);
    await expectPanel(page, 'pGate');
    await expect(balloon(page, 'b-later')).toBeVisible({ timeout: 15000 });
    expect(await plays(page)).toEqual([]);

    await showToolbar(page);
    const voices = toolbarButton(page, "Hear/mute the characters' voices");
    await expect(voices).toHaveAttribute('aria-pressed', 'false');
    await voices.click();
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en']);
  });

  test('page view: the panels of a page read in order, and a language switch re-reads the page', async ({ page }) => {
    await stubManifest(page, bubbleVoicesManifest());
    await openPlayer(page, '', { view: 'default' });
    await expect(page.locator('pw-viewport .page-canvas').first()).toBeVisible({ timeout: 15000 });
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en', 'hall']);

    await showToolbar(page);
    await toolbarButton(page, 'Select language').click();
    await page.locator('.language-item', { hasText: 'de-DE' }).click();
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en', 'hall', 'now-de', 'later-de', 'hall']);
  });

  test('a tap on a balloon speaks its line again', async ({ page }) => {
    await stubManifest(page, bubbleVoicesManifest());
    await openPlayer(page);
    await expectPanel(page, 'pGate');
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en']);

    // The balloon wrapper sits under the artwork for pointer hit-testing in panel view; fire its click directly.
    await balloon(page, 'b-now').dispatchEvent('click');
    await expect.poll(() => plays(page), { timeout: 15000 }).toEqual(['now-en', 'later-en', 'now-en']);
  });
});
