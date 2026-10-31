import { bubbleAudioAssetId, hasVoicedBubbles, voiceCuesFor } from './bubble-voice-utils';
import type { Panel } from '../types';

const panel = (speechBubbles: unknown[]): Panel => ({ speechBubbles }) as unknown as Panel;

describe('bubble voice utils', () => {
  it('reads the spoken line as a string or an asset reference', () => {
    expect(bubbleAudioAssetId({ audioAssetId: 'voice-b1' })).toBe('voice-b1');
    expect(bubbleAudioAssetId({ audioAssetId: '  voice-b1 ' })).toBe('voice-b1');
    expect(bubbleAudioAssetId({ audioAssetId: { assetId: 'voice-b1', locale: 'de-DE' } as never })).toBe('voice-b1');
    expect(bubbleAudioAssetId({ audioAssetId: '' })).toBe('');
    expect(bubbleAudioAssetId({})).toBe('');
    expect(bubbleAudioAssetId(null)).toBe('');
    expect(bubbleAudioAssetId({ audioAssetId: 42 as never })).toBe('');
  });

  it('knows whether a panel has a voiced balloon', () => {
    expect(hasVoicedBubbles(panel([{ id: 'a', text: {} }, { id: 'b', text: {}, audioAssetId: 'v' }]))).toBeTrue();
    expect(hasVoicedBubbles(panel([{ id: 'a', text: {} }]))).toBeFalse();
    expect(hasVoicedBubbles(panel([]))).toBeFalse();
    expect(hasVoicedBubbles(null)).toBeFalse();
  });

  it('orders the lines by appear time, then by array order, leaving silent balloons out', () => {
    const cues = voiceCuesFor(
      panel([
        { id: 'late', audioAssetId: 'v-late', showAtMs: 2400 },
        { id: 'silent' },
        { id: 'first', audioAssetId: 'v-first' },
        { id: 'second', audioAssetId: 'v-second', showAtMs: 0 },
        { id: 'mid', audioAssetId: { assetId: 'v-mid' }, showAtMs: 1000 },
        { audioAssetId: 'no-id' },
      ])
    );
    expect(cues.map((cue) => cue.bubbleId)).toEqual(['first', 'second', 'mid', 'late']);
    expect(cues.map((cue) => cue.assetId)).toEqual(['v-first', 'v-second', 'v-mid', 'v-late']);
    expect(cues.map((cue) => cue.showAtMs)).toEqual([0, 0, 1000, 2400]);
    expect(cues.map((cue) => cue.index)).toEqual([2, 3, 4, 0]);
  });

  it('clamps odd appear times like the balloons do', () => {
    const cues = voiceCuesFor(panel([{ id: 'a', audioAssetId: 'v', showAtMs: -5 }, { id: 'b', audioAssetId: 'v', showAtMs: 1e9 }]));
    expect(cues[0].showAtMs).toBe(0);
    expect(cues[1].showAtMs).toBe(120000);
  });
});
