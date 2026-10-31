/**
 * Spoken lines of speech balloons (`SpeechBubble.audioAssetId`, format 1.12
 * convention): which balloons of a panel have a voice and in which order
 * their lines are spoken.
 *
 * A line is spoken when its balloon appears — at `showAtMs` on the panel's
 * clock — and lines queue in array order, one after another, so two
 * balloons shown together never talk over each other.
 */
import type { Panel, SpeechBubble } from '../types';
import { bubbleShowAtMs } from './bubble-timing-utils';

/** One balloon's spoken line, in speaking order. */
export interface VoiceCue {
  bubbleId: string;
  /** Catalog id of the audio asset (its variants may carry a `locale` each). */
  assetId: string;
  /** When the balloon appears on the panel clock (0 = with the panel). */
  showAtMs: number;
  /** Position of the balloon in `speechBubbles` (ties on `showAtMs` keep array order). */
  index: number;
}

/**
 * The catalog id of a balloon's spoken line: `audioAssetId` as a string or
 * as an asset reference (`{ assetId }`); '' when the balloon has none.
 */
export function bubbleAudioAssetId(bubble: Pick<SpeechBubble, 'audioAssetId'> | null | undefined): string {
  const ref = bubble?.audioAssetId as unknown;
  if (typeof ref === 'string') {
    return ref.trim();
  }
  if (ref && typeof ref === 'object' && typeof (ref as { assetId?: unknown }).assetId === 'string') {
    return ((ref as { assetId: string }).assetId).trim();
  }
  return '';
}

/** Whether any balloon of the panel has a spoken line. */
export function hasVoicedBubbles(panel: Pick<Panel, 'speechBubbles'> | null | undefined): boolean {
  return (panel?.speechBubbles ?? []).some((bubble) => bubbleAudioAssetId(bubble) !== '');
}

/**
 * The panel's spoken lines in speaking order: by appear time, then by
 * array order. Balloons without a line are left out.
 */
export function voiceCuesFor(panel: Pick<Panel, 'speechBubbles'> | null | undefined): VoiceCue[] {
  const cues: VoiceCue[] = [];
  (panel?.speechBubbles ?? []).forEach((bubble, index) => {
    const assetId = bubbleAudioAssetId(bubble);
    if (!assetId || typeof bubble?.id !== 'string' || !bubble.id) {
      return;
    }
    cues.push({ bubbleId: bubble.id, assetId, showAtMs: bubbleShowAtMs(bubble), index });
  });
  return cues.sort((a, b) => a.showAtMs - b.showAtMs || a.index - b.index);
}
