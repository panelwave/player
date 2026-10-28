/**
 * Timed speech balloons (schema 1.10 `SpeechBubble.showAtMs`).
 *
 * A balloon with `showAtMs > 0` waits on its panel's clock (see
 * `BubbleClockDirective` / `BubbleClock`) and appears at that time. These
 * helpers read the field defensively: manifests come from many tools, so a
 * negative, fractional, string or oversized value must not break rendering.
 */
import type { Panel, SpeechBubble } from '../types';

/** Upper bound of `showAtMs` (schema maximum, same cap as animation keyframes). */
export const MAX_BUBBLE_SHOW_AT_MS = 120000;

/**
 * Minimum time the last timed balloon stays on screen before autoplay
 * advances a panel without video (the panel's dwell is extended to
 * `lastBubbleShowAtMs + BUBBLE_READ_MS`).
 */
export const BUBBLE_READ_MS = 2000;

/** The balloon's appear time in ms: a whole number in 0..MAX_BUBBLE_SHOW_AT_MS (0 = with the panel). */
export function bubbleShowAtMs(bubble: Pick<SpeechBubble, 'showAtMs'> | null | undefined): number {
  const raw = bubble?.showAtMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.min(MAX_BUBBLE_SHOW_AT_MS, Math.round(raw));
}

/** Whether any balloon of the panel waits for its time. */
export function hasTimedBubbles(panel: Pick<Panel, 'speechBubbles'> | null | undefined): boolean {
  return (panel?.speechBubbles ?? []).some((bubble) => bubbleShowAtMs(bubble) > 0);
}

/** The latest appear time of the panel's balloons in ms (0 when none is timed). */
export function lastBubbleShowAtMs(panel: Pick<Panel, 'speechBubbles'> | null | undefined): number {
  let last = 0;
  for (const bubble of panel?.speechBubbles ?? []) {
    last = Math.max(last, bubbleShowAtMs(bubble));
  }
  return last;
}

/**
 * Ids of the panel's video layers. Their playback drives the balloon clock:
 * the clock of a panel with a video starts when the video starts playing.
 */
export function panelVideoLayerIds(panel: Pick<Panel, 'layers'> | null | undefined): string[] {
  return (panel?.layers ?? []).filter((layer) => layer?.kind === 'video').map((layer) => layer.id);
}
