import { buildWorkTimeline, cuesForPanel, resolveTrackRanges } from './sequence-audio-timeline';
import type { PanelWaveManifest } from '../types';

/**
 * Work line (tablet-portrait, 3 s per panel unless set):
 *   ch1: pg1 [a1, a2] 0–6 s · pg2 [a3 (6 s)] 6–12 s
 *   ch2: pg3 [b1] 12–15 s        (+ a mobile-only page that must not count)
 */
function work(tracks: { ch1?: unknown[]; ch2?: unknown[] } = {}): PanelWaveManifest {
  const panel = (ms?: number) => (ms ? { durationMs: ms } : {});
  const page = (id: string, readingOrder: string[], format = 'tablet-portrait') => ({ id, layout: { format, placements: [] }, readingOrder });
  return {
    chapters: [
      {
        id: 'ch1',
        panels: { a1: panel(), a2: panel(), a3: panel(6000) },
        pages: [page('pg1', ['a1', 'a2']), page('pg2', ['a3'])],
        sequenceAudioTracks: tracks.ch1 ?? [],
      },
      {
        id: 'ch2',
        panels: { b1: panel(), m1: panel() },
        pages: [page('pg3', ['b1']), page('pgm', ['m1'], 'mobile-portrait')],
        sequenceAudioTracks: tracks.ch2 ?? [],
      },
    ],
  } as unknown as PanelWaveManifest;
}

const track = (over: Record<string, unknown>) => ({ id: 't', friendlyId: 't', assetId: 'music', role: 'music', startTime: 0, duration: 0, ...over });

describe('sequence-audio-timeline', () => {
  it('builds the work line from the format\'s pages and panel durations', () => {
    const line = buildWorkTimeline(work(), 'tablet-portrait', 3000);
    expect(line.entries.map((e) => [e.panelId, e.chapterId, e.startMs, e.endMs])).toEqual([
      ['a1', 'ch1', 0, 3000], ['a2', 'ch1', 3000, 6000], ['a3', 'ch1', 6000, 12000], ['b1', 'ch2', 12000, 15000],
    ]);
    expect(line.chapters.get('ch2')).toEqual({ startMs: 12000, endMs: 15000 });
    expect(line.endMs).toBe(15000);
    expect(buildWorkTimeline(null, null).entries).toEqual([]);
  });

  it('places custom tracks relative to their chapter and ends them with it', () => {
    const m = work({ ch2: [track({ id: 'rain', startTime: 1000, duration: 60000 })] });
    const line = buildWorkTimeline(m, 'tablet-portrait', 3000);
    const [range] = resolveTrackRanges(m, line, 'tablet-portrait');
    expect([range.startMs, range.endMs]).toEqual([13000, 15000]);
  });

  it('uses the panel anchors for page / chapter spans', () => {
    const m = work({ ch1: [track({ id: 'page', span: 'page', startPanelId: 'a3', endPanelId: 'a3', startTime: 6000, duration: 3000 })] });
    const line = buildWorkTimeline(m, 'tablet-portrait', 3000);
    const [range] = resolveTrackRanges(m, line, 'tablet-portrait');
    expect([range.startMs, range.endMs]).toEqual([6000, 12000]); // a3 lasts 6 s in this line
  });

  it('lets a work track run across chapters to its end anchor (else the last panel)', () => {
    const anchored = work({ ch1: [track({ id: 'w', span: 'work', startPanelId: 'a1', endPanelId: 'b1', duration: 9000 })] });
    let line = buildWorkTimeline(anchored, 'tablet-portrait', 3000);
    expect(resolveTrackRanges(anchored, line, 'tablet-portrait').map((r) => [r.startMs, r.endMs])).toEqual([[0, 15000]]);
    const unanchored = work({ ch1: [track({ id: 'w', span: 'work', duration: 9000 })] });
    line = buildWorkTimeline(unanchored, 'tablet-portrait', 3000);
    expect(resolveTrackRanges(unanchored, line, 'tablet-portrait').map((r) => r.endMs)).toEqual([15000]);
  });

  it('skips muted tracks, other formats and chapters without panels in the format', () => {
    const m = work({
      ch1: [track({ id: 'muted', muted: true, duration: 1000 }), track({ id: 'mobile', format: 'mobile-portrait', duration: 1000 }), track({ id: 'ok', duration: 1000 })],
    });
    const line = buildWorkTimeline(m, 'tablet-portrait', 3000);
    expect(resolveTrackRanges(m, line, 'tablet-portrait').map((r) => r.track.id)).toEqual(['ok']);
    expect(resolveTrackRanges(m, line, null).map((r) => r.track.id)).toEqual(['mobile', 'ok']);
  });

  it('cues: offset when entering mid-track, delay when it starts inside the panel, stop when it ends inside', () => {
    const m = work({
      ch1: [
        track({ id: 'running', startTime: 0, duration: 12000 }),
        track({ id: 'later', startTime: 4500, duration: 1000 }),
      ],
    });
    const line = buildWorkTimeline(m, 'tablet-portrait', 3000);
    const ranges = resolveTrackRanges(m, line, 'tablet-portrait');
    const cues = cuesForPanel(ranges, line.byPanel.get('a2')!);
    expect(cues.map((c) => [c.range.track.id, c.delayMs, c.offsetMs, c.stopAfterMs])).toEqual([
      ['running', 0, 3000, undefined],
      ['later', 1500, 0, 2500],
    ]);
    expect(cuesForPanel(ranges, line.byPanel.get('b1')!)).toEqual([]);
  });
});
