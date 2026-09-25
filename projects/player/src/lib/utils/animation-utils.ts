/**
 * Animation Utilities
 * Easing functions, motion detection, and animation helpers
 */

/**
 * Easing function type
 * Takes a progress value (0-1) and returns an eased value (0-1)
 */
export type EasingFunction = (t: number) => number;

/**
 * Get an easing function by name
 * 
 * @param easing - Easing name
 * @returns Easing function
 * 
 * @example
 * ```typescript
 * const easeOut = getEasingFunction('ease-out');
 * easeOut(0.5);  // Returns: ~0.77 (accelerates quickly, then decelerates)
 * ```
 */
export function getEasingFunction(
  easing = 'ease'
): EasingFunction {
  const easingFunctions: Record<string, EasingFunction> = {
    linear: easings.linear,
    ease: easings.ease,
    'ease-in': easings.easeIn,
    'ease-out': easings.easeOut,
    'ease-in-out': easings.easeInOut,
    'ease-in-quad': easings.easeInQuad,
    'ease-out-quad': easings.easeOutQuad,
    'ease-in-out-quad': easings.easeInOutQuad,
    'ease-in-cubic': easings.easeInCubic,
    'ease-out-cubic': easings.easeOutCubic,
    'ease-in-out-cubic': easings.easeInOutCubic,
    'ease-in-quart': easings.easeInQuart,
    'ease-out-quart': easings.easeOutQuart,
    'ease-in-out-quart': easings.easeInOutQuart,
    'ease-in-quint': easings.easeInQuint,
    'ease-out-quint': easings.easeOutQuint,
    'ease-in-out-quint': easings.easeInOutQuint,
    'ease-in-sine': easings.easeInSine,
    'ease-out-sine': easings.easeOutSine,
    'ease-in-out-sine': easings.easeInOutSine,
    'ease-in-expo': easings.easeInExpo,
    'ease-out-expo': easings.easeOutExpo,
    'ease-in-out-expo': easings.easeInOutExpo,
    'ease-in-circ': easings.easeInCirc,
    'ease-out-circ': easings.easeOutCirc,
    'ease-in-out-circ': easings.easeInOutCirc,
    'ease-in-back': easings.easeInBack,
    'ease-out-back': easings.easeOutBack,
    'ease-in-out-back': easings.easeInOutBack,
    'ease-in-elastic': easings.easeInElastic,
    'ease-out-elastic': easings.easeOutElastic,
    'ease-in-out-elastic': easings.easeInOutElastic,
    'ease-in-bounce': easings.easeInBounce,
    'ease-out-bounce': easings.easeOutBounce,
    'ease-in-out-bounce': easings.easeInOutBounce,
  };

  return easingFunctions[easing] || easings.ease;
}

/**
 * Check if user prefers reduced motion
 * 
 * @returns True if user has reduced motion preference enabled
 * 
 * @example
 * ```typescript
 * if (shouldReduceMotion()) {
 *   // Use cut instead of slide transition
 *   // Skip parallax effects
 *   // Reduce animation duration
 * }
 * ```
 */
export function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }

  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  return mediaQuery.matches;
}

/**
 * Get adjusted animation duration based on reduced motion preference
 * 
 * @param baseDuration - Base animation duration in milliseconds
 * @param reducedFactor - Factor to multiply by if reduced motion (default: 0.1)
 * @returns Adjusted duration
 * 
 * @example
 * ```typescript
 * const duration = getAdjustedDuration(500);
 * // Returns: 500 if normal motion, 50 if reduced motion
 * ```
 */
export function getAdjustedDuration(
  baseDuration: number,
  reducedFactor = 0.1
): number {
  return shouldReduceMotion() ? baseDuration * reducedFactor : baseDuration;
}

/**
 * Clamp a value between min and max
 * 
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * 
 * @param start - Start value
 * @param end - End value
 * @param t - Progress (0-1)
 * @returns Interpolated value
 * 
 * @example
 * ```typescript
 * lerp(0, 100, 0.5);  // Returns: 50
 * lerp(10, 20, 0.25); // Returns: 12.5
 * ```
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Map a value from one range to another
 * 
 * @param value - Input value
 * @param inMin - Input range minimum
 * @param inMax - Input range maximum
 * @param outMin - Output range minimum
 * @param outMax - Output range maximum
 * @returns Mapped value
 * 
 * @example
 * ```typescript
 * mapRange(5, 0, 10, 0, 100);  // Returns: 50
 * mapRange(25, 0, 100, 0, 1);  // Returns: 0.25
 * ```
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, t);
}

/**
 * Request animation frame with fallback
 * 
 * @param callback - Function to call on next frame
 * @returns Request ID for cancellation
 */
export function requestFrame(callback: FrameRequestCallback): number {
  if (typeof window !== 'undefined' && window.requestAnimationFrame) {
    return window.requestAnimationFrame(callback);
  }
  // Fallback to setTimeout
  return setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

/**
 * Cancel animation frame with fallback
 * 
 * @param id - Request ID from requestFrame
 */
export function cancelFrame(id: number): void {
  if (typeof window !== 'undefined' && window.cancelAnimationFrame) {
    window.cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * Animate a value over time using requestAnimationFrame
 * 
 * @param options - Animation options
 * @returns Promise that resolves when animation completes
 * 
 * @example
 * ```typescript
 * await animate({
 *   from: 0,
 *   to: 100,
 *   duration: 1000,
 *   easing: 'ease-out',
 *   onUpdate: (value) => {
 *     element.style.opacity = value / 100;
 *   }
 * });
 * ```
 */
export function animate(options: {
  from: number;
  to: number;
  duration: number;
  easing?: string;
  onUpdate: (value: number, progress: number) => void;
  onComplete?: () => void;
}): Promise<void> {
  return new Promise((resolve) => {
    const { from, to, duration, easing = 'ease', onUpdate, onComplete } = options;
    const easingFn = getEasingFunction(easing);
    const startTime = performance.now();

    function step(currentTime: number): void {
      const elapsed = currentTime - startTime;
      const progress = clamp(elapsed / duration, 0, 1);
      const easedProgress = easingFn(progress);
      const value = lerp(from, to, easedProgress);

      onUpdate(value, progress);

      if (progress < 1) {
        requestFrame(step);
      } else {
        if (onComplete) {
          onComplete();
        }
        resolve();
      }
    }

    requestFrame(step);
  });
}

/**
 * Easing functions collection
 * Based on https://easings.net/
 */
export const easings = {
  // No easing
  linear: (t: number): number => t,

  // CSS standard easings
  ease: (t: number): number => {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },

  easeIn: (t: number): number => {
    return t * t * t;
  },

  easeOut: (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  },

  easeInOut: (t: number): number => {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },

  // Quadratic
  easeInQuad: (t: number): number => {
    return t * t;
  },

  easeOutQuad: (t: number): number => {
    return 1 - (1 - t) * (1 - t);
  },

  easeInOutQuad: (t: number): number => {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  },

  // Cubic
  easeInCubic: (t: number): number => {
    return t * t * t;
  },

  easeOutCubic: (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  },

  easeInOutCubic: (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },

  // Quartic
  easeInQuart: (t: number): number => {
    return t * t * t * t;
  },

  easeOutQuart: (t: number): number => {
    return 1 - Math.pow(1 - t, 4);
  },

  easeInOutQuart: (t: number): number => {
    return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
  },

  // Quintic
  easeInQuint: (t: number): number => {
    return t * t * t * t * t;
  },

  easeOutQuint: (t: number): number => {
    return 1 - Math.pow(1 - t, 5);
  },

  easeInOutQuint: (t: number): number => {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
  },

  // Sine
  easeInSine: (t: number): number => {
    return 1 - Math.cos((t * Math.PI) / 2);
  },

  easeOutSine: (t: number): number => {
    return Math.sin((t * Math.PI) / 2);
  },

  easeInOutSine: (t: number): number => {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  },

  // Exponential
  easeInExpo: (t: number): number => {
    return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
  },

  easeOutExpo: (t: number): number => {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  },

  easeInOutExpo: (t: number): number => {
    return t === 0
      ? 0
      : t === 1
      ? 1
      : t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  // Circular
  easeInCirc: (t: number): number => {
    return 1 - Math.sqrt(1 - Math.pow(t, 2));
  },

  easeOutCirc: (t: number): number => {
    return Math.sqrt(1 - Math.pow(t - 1, 2));
  },

  easeInOutCirc: (t: number): number => {
    return t < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
  },

  // Back
  easeInBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },

  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },

  easeInOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },

  // Elastic
  easeInElastic: (t: number): number => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },

  easeOutElastic: (t: number): number => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  easeInOutElastic: (t: number): number => {
    const c5 = (2 * Math.PI) / 4.5;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },

  // Bounce
  easeInBounce: (t: number): number => {
    return 1 - easings.easeOutBounce(1 - t);
  },

  easeOutBounce: (t: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },

  easeInOutBounce: (t: number): number => {
    return t < 0.5
      ? (1 - easings.easeOutBounce(1 - 2 * t)) / 2
      : (1 + easings.easeOutBounce(2 * t - 1)) / 2;
  },
};
