import type { AnimationKeyframe, PanelAnimations } from '../types';
import {
  animationTime,
  buildKeyframeTracks,
  hasKeyframes,
  keyframeAnimationDuration,
  layerAnimationStyles,
  sampleKeyframes,
  sampleTrack,
} from './keyframe-animation';

const kf = (over: Partial<AnimationKeyframe> = {}): AnimationKeyframe => ({
  layerId: 'l1',
  property: 'opacity',
  timeMs: 0,
  value: 0,
  ...over,
});

describe('keyframe-animation', () => {
  describe('hasKeyframes', () => {
    it('is false without usable keyframes', () => {
      expect(hasKeyframes(undefined)).toBe(false);
      expect(hasKeyframes({ durationMs: 1000 })).toBe(false);
      expect(hasKeyframes({ keyframes: [] })).toBe(false);
      expect(hasKeyframes({ keyframes: [kf({ property: 'skew' as never })] })).toBe(false);
    });

    it('is true with at least one usable keyframe', () => {
      expect(hasKeyframes({ keyframes: [kf()] })).toBe(true);
    });
  });

  describe('buildKeyframeTracks', () => {
    it('groups by layer and property and sorts each track by time', () => {
      const tracks = buildKeyframeTracks([
        kf({ timeMs: 2000, value: 1 }),
        kf({ timeMs: 0, value: 0 }),
        kf({ property: 'transform.x', timeMs: 500, value: 0.2 }),
        kf({ layerId: 'l2', timeMs: 100, value: 0.5 }),
      ]);
      expect([...tracks.keys()]).toEqual(['l1', 'l2']);
      expect(tracks.get('l1')!.get('opacity')!.map((k) => k.timeMs)).toEqual([0, 2000]);
      expect(tracks.get('l1')!.get('transform.x')!.length).toBe(1);
    });

    it('drops malformed keyframes', () => {
      const tracks = buildKeyframeTracks([
        kf({ layerId: '' }),
        kf({ timeMs: -5 }),
        kf({ value: Number.NaN }),
        kf({ property: 'color' as never }),
        null as unknown as AnimationKeyframe,
      ]);
      expect(tracks.size).toBe(0);
    });
  });

  describe('keyframeAnimationDuration', () => {
    it('prefers durationMs and falls back to the last keyframe', () => {
      const keyframes = [kf({ timeMs: 0 }), kf({ timeMs: 1800, value: 1 })];
      expect(keyframeAnimationDuration({ durationMs: 5000, keyframes })).toBe(5000);
      expect(keyframeAnimationDuration({ keyframes })).toBe(1800);
      expect(keyframeAnimationDuration({ durationMs: 0, keyframes })).toBe(1800);
      expect(keyframeAnimationDuration(undefined)).toBe(0);
    });
  });

  describe('sampleTrack', () => {
    const track = [kf({ timeMs: 1000, value: 10 }), kf({ timeMs: 3000, value: 30 })];

    it('holds the first value before and the last value after the track', () => {
      expect(sampleTrack(track, 0)).toBe(10);
      expect(sampleTrack(track, 1000)).toBe(10);
      expect(sampleTrack(track, 3000)).toBe(30);
      expect(sampleTrack(track, 9999)).toBe(30);
    });

    it('interpolates linearly by default', () => {
      expect(sampleTrack(track, 2000)).toBeCloseTo(20, 6);
      expect(sampleTrack(track, 1500)).toBeCloseTo(15, 6);
    });

    it('uses the easing of the earlier keyframe', () => {
      const eased = [kf({ timeMs: 0, value: 0, easing: 'ease-in' }), kf({ timeMs: 1000, value: 100, easing: 'linear' })];
      // ease-in is slower than linear in the first half.
      expect(sampleTrack(eased, 250)).toBeLessThan(25);
      expect(sampleTrack(eased, 1000)).toBe(100);
    });

    it('jumps at keyframes that share a time', () => {
      const jump = [kf({ timeMs: 0, value: 0 }), kf({ timeMs: 1000, value: 1 }), kf({ timeMs: 1000, value: 5 })];
      expect(sampleTrack(jump, 1000)).toBe(5);
    });
  });

  describe('sampleKeyframes', () => {
    it('returns the animated properties per layer', () => {
      const tracks = buildKeyframeTracks([
        kf({ timeMs: 0, value: 0 }),
        kf({ timeMs: 1000, value: 1 }),
        kf({ layerId: 'l2', property: 'transform.scale', timeMs: 0, value: 2 }),
      ]);
      const states = sampleKeyframes(tracks, 500);
      expect(states.get('l1')!['opacity']).toBeCloseTo(0.5, 6);
      expect(states.get('l2')).toEqual({ 'transform.scale': 2 });
    });
  });

  describe('animationTime', () => {
    it('clamps a non-looping animation and reports the end', () => {
      expect(animationTime(500, 2000, false)).toEqual({ timeMs: 500, done: false });
      expect(animationTime(2500, 2000, false)).toEqual({ timeMs: 2000, done: true });
    });

    it('wraps a looping animation and never ends', () => {
      expect(animationTime(2500, 2000, true)).toEqual({ timeMs: 500, done: false });
    });

    it('treats a zero duration as already finished', () => {
      expect(animationTime(100, 0, true)).toEqual({ timeMs: 0, done: true });
    });
  });

  describe('layerAnimationStyles', () => {
    it('leaves properties without keyframes untouched (null)', () => {
      expect(layerAnimationStyles({}, 800, 600)).toEqual({
        opacity: null, translate: null, rotate: null, scale: null, filter: null,
      });
    });

    it('resolves offsets against the panel box and clamps opacity', () => {
      const styles = layerAnimationStyles({ opacity: 1.4, 'transform.x': 0.25, 'transform.y': -0.1 }, 800, 600);
      expect(styles.opacity).toBe('1');
      expect(styles.translate).toBe('200px -60px');
    });

    it('emits rotation, scale and filters', () => {
      const styles = layerAnimationStyles(
        { 'transform.rotation': 45, 'transform.scale': 1.5, blur: 10, brightness: 1.2, contrast: 0.8, saturate: 0 },
        512,
        512
      );
      expect(styles.rotate).toBe('45deg');
      expect(styles.scale).toBe('1.5');
      // blur is authored at a 1024 px wide panel: 10 px -> 5 px at 512 px.
      expect(styles.filter).toBe('blur(5px) brightness(1.2) contrast(0.8) saturate(0)');
    });

    it('omits a zero blur', () => {
      expect(layerAnimationStyles({ blur: 0 }, 1024, 768).filter).toBeNull();
    });
  });

  it('runs a typical manifest animation end to end', () => {
    const animations: PanelAnimations = {
      durationMs: 4000,
      keyframes: [
        kf({ property: 'transform.x', timeMs: 0, value: -0.4 }),
        kf({ property: 'transform.x', timeMs: 3000, value: 0 }),
        kf({ timeMs: 0, value: 0 }),
        kf({ timeMs: 800, value: 1 }),
      ],
    };
    const tracks = buildKeyframeTracks(animations.keyframes);
    const end = sampleKeyframes(tracks, keyframeAnimationDuration(animations)).get('l1')!;
    expect(end['transform.x']).toBe(0);
    expect(end['opacity']).toBe(1);
  });
});
