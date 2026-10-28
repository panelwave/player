import { test, expect, type Page } from '@playwright/test';
import { openPlayer, dismissCover } from './helpers/player';

/**
 * Audio player widgets and navigation (schema 1.10 `keepPlaying`): by default
 * the audio stops when the reader moves to another panel — also while its
 * panel is still on screen (canvas neighbours, page view); with
 * `keepPlaying` it plays on, even after its panel left the screen, and the
 * widget shows it playing again when the reader comes back.
 */

const audios = (page: Page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('audio')).map((a) => ({ playing: !a.paused, parked: !!a.closest('[data-pw-parked-audio]') })));
const anyPlaying = async (page: Page) => (await audios(page)).some((a) => a.playing);
const blurAndPress = async (page: Page, key: string) => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(key);
};

/** The canvas demo with an audio player on p-fall, which sits right below p-top (both on screen). */
async function routeCanvas(page: Page, keepPlaying: boolean): Promise<void> {
  await page.route('**/assets/canvas-manifest.json', async (route) => {
    const response = await route.fetch();
    const m = await response.json();
    m.panelwave.version = '1.10.0';
    m.assets.catalog.push({ id: 'aud-x', category: 'audio', durationMs: 8000, variants: [{ src: 'assets/widgets/interview.mp3', mime: 'audio/mpeg' }] });
    m.chapters[0].canvas.placements['p-fall'].y = 640;
    m.chapters[0].panels['p-fall'].layers.push({ kind: 'audioPlayer', id: 'ly-fall-audio', assetId: 'aud-x', z: 5, x: 40, y: 40, width: 600, height: 140, keepPlaying });
    await route.fulfill({ response, json: m });
  });
}

/** The widgets work in panel view: two panels, the audio player on the first. */
async function routeWidgets(page: Page, keepPlaying: boolean): Promise<void> {
  await page.route('**/assets/widgets-manifest.json', async (route) => {
    const response = await route.fetch();
    const m = await response.json();
    const ch = m.chapters[0];
    ch.panels['pw-1'].layers.find((l: { kind: string }) => l.kind === 'audioPlayer').keepPlaying = keepPlaying;
    ch.panels['pw-2'] = { layers: [{ kind: 'image', id: 'ly-pw-2-bg', assetId: 'img-bg', z: 0 }] };
    ch.pages[0].layout.placements = [
      { panelId: 'pw-1', x: 0, y: 0, w: 0.5, h: 1 },
      { panelId: 'pw-2', x: 0.5, y: 0, w: 0.5, h: 1 },
    ];
    ch.pages[0].readingOrder = ['pw-1', 'pw-2'];
    ch.graph.edges = [{ from: 'pw-1', to: 'pw-2' }];
    await route.fulfill({ response, json: m });
  });
}

async function openCanvasOnFall(page: Page): Promise<void> {
  await openPlayer(page);
  await page.getByRole('button', { name: 'Infinite Canvas' }).click();
  await dismissCover(page, true);
  await expect(page.locator('.canvas-panel.current')).toHaveAttribute('data-panel-id', 'p-top');
  await blurAndPress(page, 'ArrowRight');
  await expect(page.locator('.canvas-panel.current')).toHaveAttribute('data-panel-id', 'p-fall', { timeout: 10_000 });
  await page.locator('.canvas-panel.current pw-audio-player-layer').getByRole('button', { name: /Play/ }).click();
  await expect.poll(() => anyPlaying(page)).toBe(true);
}

test.describe('audio player widgets and navigation', () => {
  test('canvas: the audio stops when the reader moves on, though its panel stays on screen', async ({ page }) => {
    await routeCanvas(page, false);
    await openCanvasOnFall(page);
    await blurAndPress(page, 'ArrowLeft');
    await expect(page.locator('.canvas-panel.current')).toHaveAttribute('data-panel-id', 'p-top', { timeout: 10_000 });
    await expect(page.locator('.canvas-panel[data-panel-id="p-fall"] pw-audio-player-layer')).toHaveCount(1);
    await expect.poll(() => anyPlaying(page)).toBe(false);
  });

  test('canvas: with keepPlaying the audio plays on', async ({ page }) => {
    await routeCanvas(page, true);
    await openCanvasOnFall(page);
    await blurAndPress(page, 'ArrowLeft');
    await expect(page.locator('.canvas-panel.current')).toHaveAttribute('data-panel-id', 'p-top', { timeout: 10_000 });
    await page.waitForTimeout(800);
    expect(await anyPlaying(page)).toBe(true);
  });

  test('panel view: with keepPlaying the audio plays on after its panel left and the widget resumes it', async ({ page }) => {
    await routeWidgets(page, true);
    await openPlayer(page, '?manifest=assets/widgets-manifest.json');
    const player = page.locator('.t-frame pw-audio-player-layer');
    await player.getByRole('button', { name: /Play/ }).click();
    await expect.poll(() => anyPlaying(page)).toBe(true);

    await blurAndPress(page, 'ArrowRight'); // pw-2: the widget unmounts
    await expect(page.locator('.t-frame pw-audio-player-layer')).toHaveCount(0, { timeout: 10_000 });
    await page.waitForTimeout(800);
    expect(await audios(page)).toEqual([{ playing: true, parked: true }]);

    await blurAndPress(page, 'ArrowLeft'); // back on pw-1: the widget shows it playing
    await expect(player.getByRole('button', { name: /Pause/ })).toBeVisible({ timeout: 10_000 });
    expect(await audios(page)).toContainEqual({ playing: true, parked: false });
    await player.getByRole('button', { name: /Pause/ }).click();
    await expect.poll(() => anyPlaying(page)).toBe(false);
  });

  test('panel view: the arrow key moves on right after clicking Play (focus on the play button)', async ({ page }) => {
    await routeWidgets(page, false);
    await openPlayer(page, '?manifest=assets/widgets-manifest.json');
    const play = page.locator('.t-frame pw-audio-player-layer').getByRole('button', { name: /Play/ });
    await play.click();
    // Chromium and Firefox focus a clicked button (Safari does not): put focus there in every engine.
    const pause = page.locator('.t-frame pw-audio-player-layer').getByRole('button', { name: /Pause/ });
    await pause.focus();
    await expect(pause).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.t-frame pw-audio-player-layer')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('.t-frame [data-layer-id="ly-pw-2-bg"]')).toBeVisible();
  });

  test('panel view: by default the audio stops when the reader moves on', async ({ page }) => {
    await routeWidgets(page, false);
    await openPlayer(page, '?manifest=assets/widgets-manifest.json');
    await page.locator('.t-frame pw-audio-player-layer').getByRole('button', { name: /Play/ }).click();
    await expect.poll(() => anyPlaying(page)).toBe(true);
    await blurAndPress(page, 'ArrowRight');
    await expect(page.locator('.t-frame pw-audio-player-layer')).toHaveCount(0, { timeout: 10_000 });
    await expect.poll(() => anyPlaying(page)).toBe(false);
  });
});
