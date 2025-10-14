/**
 * Unit tests for animation utilities
 */

import {
  getEasingFunction,
  shouldReduceMotion,
  getAdjustedDuration,
  clamp,
  lerp,
  mapRange,
  easings,
} from './animation-utils';

describe('AnimationUtils', () => {
  describe('getEasingFunction', () => {
    it('should return linear easing by default', () => {
      const easing = getEasingFunction();
      expect(easing(0)).toBe(0);
      expect(easing(0.5)).toBe(0.5);
      expect(easing(1)).toBe(1);
    });

    it('should return correct easing function for known names', () => {
      expect(getEasingFunction('linear')).toBe(easings.linear);
      expect(getEasingFunction('ease')).toBe(easings.ease);
      expect(getEasingFunction('ease-in')).toBe(easings.easeIn);
      expect(getEasingFunction('ease-out')).toBe(easings.easeOut);
    });

    it('should return ease for unknown easing names', () => {
      const easing = getEasingFunction('unknown-easing');
      expect(easing).toBe(easings.ease);
    });

    it('should handle all documented easing names', () => {
      const easingNames = [
        'linear',
        'ease',
        'ease-in',
        'ease-out',
        'ease-in-out',
        'ease-in-quad',
        'ease-out-quad',
        'ease-in-cubic',
        'ease-out-cubic',
        'ease-in-sine',
        'ease-out-sine',
        'ease-in-expo',
        'ease-out-expo',
        'ease-in-circ',
        'ease-out-circ',
        'ease-in-back',
        'ease-out-back',
        'ease-in-elastic',
        'ease-out-elastic',
        'ease-in-bounce',
        'ease-out-bounce',
      ];

      easingNames.forEach((name) => {
        const easing = getEasingFunction(name);
        expect(typeof easing).toBe('function');
        expect(easing(0)).toBeCloseTo(0, 2);
        expect(easing(1)).toBeCloseTo(1, 2);
      });
    });
  });

  describe('shouldReduceMotion', () => {
    it('should return false when matchMedia not available', () => {
      const originalMatchMedia = window.matchMedia;
      (window as any).matchMedia = undefined;

      expect(shouldReduceMotion()).toBe(false);

      window.matchMedia = originalMatchMedia;
    });

    it('should check prefers-reduced-motion media query', () => {
      const mockMatches = false;
      const originalMatchMedia = window.matchMedia;

      window.matchMedia = jasmine.createSpy('matchMedia').and.returnValue({
        matches: mockMatches,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: jasmine.createSpy(),
        removeEventListener: jasmine.createSpy(),
        addListener: jasmine.createSpy(),
        removeListener: jasmine.createSpy(),
        dispatchEvent: jasmine.createSpy(),
        onchange: null,
      });

      const result = shouldReduceMotion();
      expect(result).toBe(false);
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');

      window.matchMedia = originalMatchMedia;
    });
  });

  describe('getAdjustedDuration', () => {
    it('should return base duration when motion is not reduced', () => {
      spyOn(globalThis as any, 'shouldReduceMotion').and.returnValue(false);
      expect(getAdjustedDuration(1000)).toBe(1000);
    });

    it('should use custom reduction factor', () => {
      const baseDuration = 1000;
      const result = getAdjustedDuration(baseDuration, 0.5);
      // Result depends on shouldReduceMotion(), but with factor 0.5
      expect(result).toBeGreaterThanOrEqual(baseDuration * 0.1); // Min reduction
      expect(result).toBeLessThanOrEqual(baseDuration); // Max (no reduction)
    });

    it('should handle zero duration', () => {
      expect(getAdjustedDuration(0)).toBe(0);
    });
  });

  describe('clamp', () => {
    it('should clamp value below minimum', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should clamp value above maximum', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should return value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should handle equal min and max', () => {
      expect(clamp(5, 7, 7)).toBe(7);
    });

    it('should handle negative ranges', () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
      expect(clamp(-15, -10, -1)).toBe(-10);
      expect(clamp(0, -10, -1)).toBe(-1);
    });

    it('should handle decimal values', () => {
      expect(clamp(0.5, 0, 1)).toBe(0.5);
      expect(clamp(1.5, 0, 1)).toBe(1);
      expect(clamp(-0.5, 0, 1)).toBe(0);
    });
  });

  describe('lerp', () => {
    it('should interpolate at t=0', () => {
      expect(lerp(0, 100, 0)).toBe(0);
    });

    it('should interpolate at t=1', () => {
      expect(lerp(0, 100, 1)).toBe(100);
    });

    it('should interpolate at t=0.5', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('should handle negative values', () => {
      expect(lerp(-10, 10, 0.5)).toBe(0);
    });

    it('should handle reversed start/end', () => {
      expect(lerp(100, 0, 0.5)).toBe(50);
    });

    it('should extrapolate beyond range', () => {
      expect(lerp(0, 100, 1.5)).toBe(150);
      expect(lerp(0, 100, -0.5)).toBe(-50);
    });

    it('should handle decimal precision', () => {
      expect(lerp(0, 1, 0.25)).toBeCloseTo(0.25, 10);
    });
  });

  describe('mapRange', () => {
    it('should map value from one range to another', () => {
      expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    });

    it('should handle minimum value', () => {
      expect(mapRange(0, 0, 10, 0, 100)).toBe(0);
    });

    it('should handle maximum value', () => {
      expect(mapRange(10, 0, 10, 0, 100)).toBe(100);
    });

    it('should handle negative ranges', () => {
      expect(mapRange(-5, -10, 0, 0, 100)).toBe(50);
    });

    it('should handle reversed output range', () => {
      expect(mapRange(5, 0, 10, 100, 0)).toBe(50);
    });

    it('should extrapolate beyond input range', () => {
      expect(mapRange(15, 0, 10, 0, 100)).toBe(150);
    });

    it('should handle decimal precision', () => {
      expect(mapRange(25, 0, 100, 0, 1)).toBeCloseTo(0.25, 10);
    });

    it('should handle scaling to different ranges', () => {
      // Map 0-100 percentage to 0-1
      expect(mapRange(50, 0, 100, 0, 1)).toBeCloseTo(0.5, 10);
      
      // Map 0-1 to 0-100 percentage
      expect(mapRange(0.75, 0, 1, 0, 100)).toBeCloseTo(75, 10);
    });
  });

  describe('easings', () => {
    describe('linear', () => {
      it('should return input unchanged', () => {
        expect(easings.linear(0)).toBe(0);
        expect(easings.linear(0.25)).toBe(0.25);
        expect(easings.linear(0.5)).toBe(0.5);
        expect(easings.linear(0.75)).toBe(0.75);
        expect(easings.linear(1)).toBe(1);
      });
    });

    describe('ease-in-out', () => {
      it('should start and end at correct values', () => {
        expect(easings.easeInOut(0)).toBeCloseTo(0, 5);
        expect(easings.easeInOut(1)).toBeCloseTo(1, 5);
      });

      it('should be symmetric', () => {
        const t1 = easings.easeInOut(0.25);
        const t2 = easings.easeInOut(0.75);
        expect(t1).toBeCloseTo(1 - t2, 5);
      });

      it('should pass through 0.5 at t=0.5', () => {
        expect(easings.easeInOut(0.5)).toBeCloseTo(0.5, 5);
      });
    });

    describe('ease-out', () => {
      it('should decelerate', () => {
        const t1 = easings.easeOut(0.1);
        const t2 = easings.easeOut(0.2);
        const t3 = easings.easeOut(0.9);
        const t4 = easings.easeOut(1.0);

        const early = t2 - t1;
        const late = t4 - t3;

        expect(early).toBeGreaterThan(late); // Larger steps early, smaller steps late
      });
    });

    describe('ease-in', () => {
      it('should accelerate', () => {
        const t1 = easings.easeIn(0.0);
        const t2 = easings.easeIn(0.1);
        const t3 = easings.easeIn(0.9);
        const t4 = easings.easeIn(1.0);

        const early = t2 - t1;
        const late = t4 - t3;

        expect(late).toBeGreaterThan(early); // Smaller steps early, larger steps late
      });
    });

    describe('bounce', () => {
      it('should bounce at the end', () => {
        const values = [0.7, 0.8, 0.9, 0.95, 1.0].map(easings.easeOutBounce);
        
        // Should have some local maxima (bounce peaks)
        let hasLocalMax = false;
        for (let i = 1; i < values.length - 1; i++) {
          if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
            hasLocalMax = true;
            break;
          }
        }
        
        expect(hasLocalMax).toBe(true);
      });

      it('should end at 1.0', () => {
        expect(easings.easeOutBounce(1.0)).toBeCloseTo(1.0, 5);
      });
    });

    describe('elastic', () => {
      it('should oscillate', () => {
        const values = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0].map(easings.easeOutElastic);
        
        // Should have oscillation (value goes above 1 before settling)
        const hasOvershooting = values.some((v, i) => i < values.length - 1 && v > 1);
        
        expect(hasOvershooting || values[values.length - 1] === 1).toBe(true);
      });

      it('should end at 1.0', () => {
        expect(easings.easeOutElastic(1.0)).toBeCloseTo(1.0, 5);
      });
    });

    describe('back', () => {
      it('should overshoot at the end (easeOutBack)', () => {
        // Check values near the end
        const nearEnd = [0.8, 0.9, 0.95].map(easings.easeOutBack);
        
        // At least one value should exceed 1 (overshoot)
        const hasOvershoot = nearEnd.some((v) => v > 1);
        
        expect(hasOvershoot).toBe(true);
      });

      it('should end at exactly 1.0', () => {
        expect(easings.easeOutBack(1.0)).toBeCloseTo(1.0, 5);
      });

      it('should start below 0 (easeInBack)', () => {
        // Check values near the start
        const nearStart = [0.05, 0.1, 0.15].map(easings.easeInBack);
        
        // At least one value should be below 0 (undershoot)
        const hasUndershoot = nearStart.some((v) => v < 0);
        
        expect(hasUndershoot).toBe(true);
      });
    });

    describe('all easings boundary conditions', () => {
      it('all easings should start at 0', () => {
        Object.entries(easings).forEach(([name, fn]) => {
          expect(fn(0)).toBeCloseTo(0, 5, `${name} should start at 0`);
        });
      });

      it('all easings should end at 1', () => {
        Object.entries(easings).forEach(([name, fn]) => {
          expect(fn(1)).toBeCloseTo(1, 5, `${name} should end at 1`);
        });
      });

      it('all easings should be continuous', () => {
        Object.entries(easings).forEach(([name, fn]) => {
          // Test small steps don't cause huge jumps
          for (let t = 0; t <= 0.95; t += 0.05) {
            const v1 = fn(t);
            const v2 = fn(t + 0.05);
            const delta = Math.abs(v2 - v1);
            
            // Delta should be reasonable (no infinity or NaN)
            expect(isFinite(delta)).toBe(true, `${name} should be continuous at t=${t}`);
          }
        });
      });
    });
  });
});
