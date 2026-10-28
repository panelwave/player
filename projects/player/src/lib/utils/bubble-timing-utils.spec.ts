import {
  BUBBLE_READ_MS,
  MAX_BUBBLE_SHOW_AT_MS,
  bubbleShowAtMs,
  hasTimedBubbles,
  lastBubbleShowAtMs,
  panelVideoLayerIds,
} from './bubble-timing-utils';
import type { Panel, SpeechBubble } from '../types';

const bubble = (showAtMs?: unknown): SpeechBubble =>
  ({ id: 'b', text: { 'en-US': 'Hi' }, shape: { x: 0, y: 0, w: 0.2, h: 0.1 }, showAtMs }) as unknown as SpeechBubble;

describe('bubble-timing-utils', () => {
  describe('bubbleShowAtMs', () => {
    it('reads whole, positive times', () => {
      expect(bubbleShowAtMs(bubble(2400))).toBe(2400);
    });

    it('treats a missing, zero, negative or non-numeric time as "with the panel"', () => {
      expect(bubbleShowAtMs(bubble())).toBe(0);
      expect(bubbleShowAtMs(bubble(0))).toBe(0);
      expect(bubbleShowAtMs(bubble(-500))).toBe(0);
      expect(bubbleShowAtMs(bubble('2400'))).toBe(0);
      expect(bubbleShowAtMs(bubble(Number.NaN))).toBe(0);
      expect(bubbleShowAtMs(bubble(Number.POSITIVE_INFINITY))).toBe(0);
      expect(bubbleShowAtMs(null)).toBe(0);
      expect(bubbleShowAtMs(undefined)).toBe(0);
    });

    it('rounds fractions and caps at the schema maximum', () => {
      expect(bubbleShowAtMs(bubble(1499.6))).toBe(1500);
      expect(bubbleShowAtMs(bubble(500000))).toBe(MAX_BUBBLE_SHOW_AT_MS);
    });
  });

  describe('panel helpers', () => {
    const panel = (bubbles: SpeechBubble[], layers: unknown[] = []): Panel =>
      ({ speechBubbles: bubbles, layers }) as unknown as Panel;

    it('hasTimedBubbles is true only when a balloon waits', () => {
      expect(hasTimedBubbles(panel([bubble(), bubble(0)]))).toBeFalse();
      expect(hasTimedBubbles(panel([bubble(), bubble(800)]))).toBeTrue();
      expect(hasTimedBubbles(null)).toBeFalse();
      expect(hasTimedBubbles({} as Panel)).toBeFalse();
    });

    it('lastBubbleShowAtMs returns the latest appear time', () => {
      expect(lastBubbleShowAtMs(panel([bubble(1200), bubble(), bubble(3400), bubble(2000)]))).toBe(3400);
      expect(lastBubbleShowAtMs(panel([bubble()]))).toBe(0);
      expect(lastBubbleShowAtMs(undefined)).toBe(0);
    });

    it('panelVideoLayerIds lists the video layers only', () => {
      const layers = [
        { id: 'bg', kind: 'image' },
        { id: 'clip', kind: 'video' },
        { id: 'modal', kind: 'videoPlayer' },
        { id: 'clip2', kind: 'video' },
      ];
      expect(panelVideoLayerIds(panel([], layers))).toEqual(['clip', 'clip2']);
      expect(panelVideoLayerIds(null)).toEqual([]);
    });

    it('gives the last line two seconds to be read', () => {
      expect(BUBBLE_READ_MS).toBe(2000);
    });
  });
});
