import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { openPlayer, expectPanel } from './helpers/player';

/**
 * Performance guards (OPEN_TASKS "Player — Performance"), Chromium only
 * (they use the DevTools protocol):
 *  - memory: paging back and forth through the story many times must not
 *    grow the JS heap (after forced GC) — catches leaked subscriptions,
 *    listeners and detached panel DOM;
 *  - frame rate: panel transitions animate without long frames.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'CDP metrics are Chromium-only');

async function heapAfterGc(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize;
}

async function roundTrip(page: Page): Promise<void> {
  // p1-1 -> p1-4 and back: four panels, both directions.
  for (const id of ['p1-2', 'p1-3', 'p1-4']) {
    await page.keyboard.press('ArrowRight');
    await expectPanel(page, id);
  }
  for (const id of ['p1-3', 'p1-2', 'p1-1']) {
    await page.keyboard.press('ArrowLeft');
    await expectPanel(page, id);
  }
  await expect(page.locator('.t-frame-leave')).toHaveCount(0);
}

test.describe('player performance', () => {
  test('repeated navigation does not grow the heap', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' }); // fast, deterministic panel swaps
    await openPlayer(page);
    await expectPanel(page, 'p1-1');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');

    // Warm up (lazy chunks, caches, first-render allocations), then measure.
    for (let i = 0; i < 3; i++) await roundTrip(page);
    const before = await heapAfterGc(cdp);
    for (let i = 0; i < 15; i++) await roundTrip(page);
    const after = await heapAfterGc(cdp);

    const growthMb = (after - before) / 1048576;
    test.info().annotations.push({ type: 'heap', description: `${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB (${growthMb.toFixed(2)} MB over 90 panel changes)` });
    expect(growthMb, 'heap growth over 90 panel changes').toBeLessThan(2);
  });

  test('panel transitions run without long frames', async ({ page }) => {
    await openPlayer(page);
    await expectPanel(page, 'p1-1');

    const intervals: number[] = [];
    for (const id of ['p1-2', 'p1-3', 'p1-4']) {
      // Record requestAnimationFrame intervals across one full transition.
      await page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __gen: number };
        // A generation token ends the previous loop (a plain stop flag was
        // reset before its last frame fired, leaving two loops running).
        const gen = (w.__gen = (w.__gen ?? 0) + 1);
        w.__frames = [];
        const tick = (t: number) => {
          if (w.__gen !== gen) return;
          w.__frames.push(t);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.keyboard.press('ArrowRight');
      await expectPanel(page, id);
      await expect(page.locator('.t-frame-leave')).toHaveCount(0, { timeout: 5_000 });
      const frames = await page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __gen: number };
        w.__gen++;
        return w.__frames;
      });
      for (let i = 1; i < frames.length; i++) intervals.push(frames[i] - frames[i - 1]);
    }

    intervals.sort((a, b) => a - b);
    const p50 = intervals[Math.floor(intervals.length * 0.5)];
    const p95 = intervals[Math.floor(intervals.length * 0.95)];
    test.info().annotations.push({ type: 'frames', description: `${intervals.length} frames, p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms` });
    // 60 fps = 16.7 ms per frame. The median must hold it; allow the odd
    // slower frame (CI runners, screenshotting) but no long frames.
    expect(p50, 'median frame interval').toBeLessThan(20);
    expect(p95, '95th percentile frame interval').toBeLessThan(50);
  });
});
