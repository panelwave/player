/**
 * Video Config Utilities Tests
 * Covers legacy mapping (loop/autoplay) and the defaults cascade.
 */

import type { VideoLayer, UIDefaults } from '../types';
import {
  resolvePlayMode,
  resolveStartMode,
  resolveMuted,
  resolveVideoConfig,
} from './video-config-utils';

function layer(partial: Partial<VideoLayer>): Partial<VideoLayer> {
  return { kind: 'video', assetId: 'v', id: 'l1', ...partial };
}

describe('video-config-utils', () => {
  describe('resolvePlayMode (legacy mapping + cascade)', () => {
    it('defaults to once when nothing set', () => {
      expect(resolvePlayMode(layer({}))).toBe('once');
    });

    it('maps legacy loop:true to loop', () => {
      expect(resolvePlayMode(layer({ loop: true }))).toBe('loop');
    });

    it('new playMode always wins over legacy loop', () => {
      expect(resolvePlayMode(layer({ loop: true, playMode: 'pingpong' }))).toBe(
        'pingpong'
      );
    });

    it('falls back to settings.ui default before built-in', () => {
      const ui: UIDefaults = { videoPlayModeDefault: 'loop-from' };
      expect(resolvePlayMode(layer({}), ui)).toBe('loop-from');
    });

    it('legacy loop still beats the ui default', () => {
      const ui: UIDefaults = { videoPlayModeDefault: 'loop-from' };
      expect(resolvePlayMode(layer({ loop: true }), ui)).toBe('loop');
    });
  });

  describe('resolveStartMode (legacy mapping + cascade)', () => {
    it('defaults to on-view', () => {
      expect(resolveStartMode(layer({}))).toBe('on-view');
    });

    it('maps legacy autoplay:true to on-view', () => {
      expect(resolveStartMode(layer({ autoplay: true }))).toBe('on-view');
    });

    it('maps explicit autoplay:false to on-click', () => {
      expect(resolveStartMode(layer({ autoplay: false }))).toBe('on-click');
    });

    it('new startMode wins over legacy autoplay', () => {
      expect(
        resolveStartMode(layer({ autoplay: false, startMode: 'on-hover' }))
      ).toBe('on-hover');
    });

    it('uses ui default when neither field present', () => {
      const ui: UIDefaults = { videoStartModeDefault: 'on-click' };
      expect(resolveStartMode(layer({}), ui)).toBe('on-click');
    });
  });

  describe('resolveMuted (cascade)', () => {
    it('defaults to true (work-level default is muted)', () => {
      expect(resolveMuted(layer({}))).toBe(true);
    });

    it('honours explicit layer muted:false', () => {
      expect(resolveMuted(layer({ muted: false }))).toBe(false);
    });

    it('uses ui default when layer muted is absent', () => {
      const ui: UIDefaults = { videoMutedDefault: false };
      expect(resolveMuted(layer({}), ui)).toBe(false);
    });

    it('layer muted wins over ui default', () => {
      const ui: UIDefaults = { videoMutedDefault: false };
      expect(resolveMuted(layer({ muted: true }), ui)).toBe(true);
    });
  });

  describe('resolveVideoConfig', () => {
    it('produces a fully-resolved config', () => {
      const cfg = resolveVideoConfig(
        layer({ playMode: 'loop-from', loopFromMs: 3000, startAtMs: 500 })
      );
      expect(cfg).toEqual({
        playMode: 'loop-from',
        startMode: 'on-view',
        muted: true,
        startAtMs: 500,
        loopFromMs: 3000,
      });
    });

    it('drops loopFromMs when playMode is not loop-from', () => {
      const cfg = resolveVideoConfig(layer({ playMode: 'loop', loopFromMs: 3000 }));
      expect(cfg.loopFromMs).toBeUndefined();
    });

    it('clamps a negative startAtMs to 0', () => {
      const cfg = resolveVideoConfig(layer({ startAtMs: -100 }));
      expect(cfg.startAtMs).toBe(0);
    });
  });
});
