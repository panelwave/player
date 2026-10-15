/**
 * Timeline (sequence) audio placement for the reader — the same model as the
 * CMS editor's timeline: the work is one line of panels (chapters in order →
 * the active format's pages → reading order), each panel lasting its
 * `durationMs` (else the work's seconds-per-panel, else 5 s).
 *
 * A chapter's `sequenceAudioTracks` sit on that line relative to their
 * chapter's start. `span` (format 1.8.0): 'page' / 'chapter' tracks cover
 * their startPanelId..endPanelId range; a 'work' track keeps playing across
 * chapter boundaries until endPanelId (else the work's last panel); every
 * other track ends with its chapter.
 *
 * The reader does not follow a clock, so the timeline is used per panel:
 * entering a panel tells which tracks cover it, from which offset, and
 * whether one starts or ends inside it (`cuesForPanel`).
 */

import type { Chapter, Page, PanelWaveManifest, SequenceAudioTrack } from '../types';
import { pagesForFormat } from './page-format-utils';
import { chapterReadingOrder } from './reading-order';

export const DEFAULT_PANEL_MS = 5000;

export interface TimelineEntry {
  panelId: string;
  chapterId: string;
  startMs: number;
  endMs: number;
}

export interface WorkTimeline {
  entries: TimelineEntry[];
  byPanel: Map<string, TimelineEntry>;
  chapters: Map<string, { startMs: number; endMs: number }>;
  endMs: number;
}

export interface TrackRange {
  track: SequenceAudioTrack;
  chapterId: string;
  startMs: number;
  endMs: number;
}

/** What to do with a track when the reader enters a panel. */
export interface PanelCue {
  range: TrackRange;
  /** The track starts this long after the panel is entered (0 = at once). */
  delayMs: number;
  /** Timeline position inside the track when it starts (ms). */
  offsetMs: number;
  /** The track ends inside this panel, this long after entering it. */
  stopAfterMs?: number;
}

/** Panels of a page in reading order (placement order without one). */
function pagePanels(page: Page): string[] {
  if (page.readingOrder?.length) {
    return page.readingOrder;
  }
  return (page.layout?.placements ?? []).map((placement) => placement.panelId);
}

/** The work's panel line for a page format (null = every page). */
export function buildWorkTimeline(
  manifest: PanelWaveManifest | null | undefined,
  format: string | null,
  defaultPanelMs = DEFAULT_PANEL_MS
): WorkTimeline {
  const entries: TimelineEntry[] = [];
  const byPanel = new Map<string, TimelineEntry>();
  const chapters = new Map<string, { startMs: number; endMs: number }>();
  let t = 0;
  for (const chapter of (manifest?.chapters ?? []) as Chapter[]) {
    const pages = pagesForFormat(chapter.pages, format);
    const order = pages.length ? pages.flatMap(pagePanels) : chapterReadingOrder(chapter);
    const chapterStart = t;
    for (const panelId of order) {
      const panel = chapter.panels?.[panelId];
      if (!panel || byPanel.has(panelId)) {
        continue;
      }
      const ms = typeof panel.durationMs === 'number' && panel.durationMs > 0 ? panel.durationMs : defaultPanelMs;
      const entry = { panelId, chapterId: chapter.id, startMs: t, endMs: t + ms };
      entries.push(entry);
      byPanel.set(panelId, entry);
      t += ms;
    }
    if (t > chapterStart) {
      chapters.set(chapter.id, { startMs: chapterStart, endMs: t });
    }
  }
  return { entries, byPanel, chapters, endMs: t };
}

/** Where each (format-matching, unmuted) timeline track sits on the work line. */
export function resolveTrackRanges(
  manifest: PanelWaveManifest | null | undefined,
  timeline: WorkTimeline,
  format: string | null
): TrackRange[] {
  const ranges: TrackRange[] = [];
  for (const chapter of (manifest?.chapters ?? []) as Chapter[]) {
    const extent = timeline.chapters.get(chapter.id);
    if (!extent) {
      continue; // no panels of this chapter in this format
    }
    for (const track of chapter.sequenceAudioTracks ?? []) {
      if (!track?.assetId || track.muted) {
        continue;
      }
      if (format && track.format && track.format !== format) {
        continue;
      }
      const span = track.span ?? 'custom';
      const first = track.startPanelId ? timeline.byPanel.get(track.startPanelId) : undefined;
      const last = track.endPanelId ? timeline.byPanel.get(track.endPanelId) : undefined;

      let startMs: number;
      let endMs: number;
      if ((span === 'page' || span === 'chapter') && first && last) {
        startMs = first.startMs;
        endMs = last.endMs;
      } else {
        startMs = extent.startMs + Math.max(0, Number(track.startTime) || 0);
        const duration = Math.max(0, Number(track.duration) || 0);
        endMs = duration > 0 ? startMs + duration : extent.endMs;
      }
      if (span === 'work') {
        endMs = last ? last.endMs : timeline.endMs;
      } else {
        endMs = Math.min(endMs, extent.endMs);
      }
      if (endMs > startMs) {
        ranges.push({ track, chapterId: chapter.id, startMs, endMs });
      }
    }
  }
  return ranges;
}

/** The tracks that sound while the reader is on `entry`'s panel. */
export function cuesForPanel(ranges: readonly TrackRange[], entry: TimelineEntry): PanelCue[] {
  const cues: PanelCue[] = [];
  for (const range of ranges) {
    if (range.startMs >= entry.endMs || range.endMs <= entry.startMs) {
      continue;
    }
    const cue: PanelCue = {
      range,
      delayMs: Math.max(0, range.startMs - entry.startMs),
      offsetMs: Math.max(0, entry.startMs - range.startMs),
    };
    if (range.endMs < entry.endMs) {
      cue.stopAfterMs = range.endMs - entry.startMs;
    }
    cues.push(cue);
  }
  return cues;
}
