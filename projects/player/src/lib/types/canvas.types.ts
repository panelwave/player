/**
 * Infinite Canvas Type Definitions (schema 1.4)
 *
 * A chapter may place its panels on one continuous world-space plane; the
 * reader's viewport travels across it along the existing graph. World units:
 * 1 unit = 1 CSS pixel at zoom 1.0 — panels are placed at their natural
 * authoring size, so layers keep their pixel coordinates unchanged.
 */

import type { Transition } from './manifest.types';
import type { NormalizedRect } from './panel.types';

/**
 * A point on the infinite-canvas plane (world units, unbounded).
 */
export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * A rectangle on the infinite-canvas plane (world units).
 */
export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Camera path shape between two panels. */
export type CameraMovePath = 'direct' | 'arc' | 'waypoints';

/**
 * Camera zoom behavior during a move: `hold` keeps the framing zoom,
 * `pull-back` zooms out far enough to see source and target before gliding
 * in, `dive` zooms straight into the target.
 */
export type CameraZoomProfile = 'hold' | 'pull-back' | 'dive';

/**
 * Animated world-space camera travel between two panels in canvas view.
 * Lives on graph edges; inherits like edge transitions
 * (edge → outputPresets default → built-in direct/hold/800ms/ease-in-out).
 */
export interface CameraMove {
  path?: CameraMovePath;

  /** Intermediate world-space points; only used when `path` is `"waypoints"`. */
  waypoints?: WorldPoint[];

  zoomProfile?: CameraZoomProfile;

  /** Duration in milliseconds (0-60000). */
  durationMs?: number;

  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';

  /** Transition used instead of the glide under prefers-reduced-motion. */
  reducedMotionFallback?: Transition;
}

/**
 * Reveal behavior of a placed panel: `always` is visible whenever on screen,
 * `on-approach` is revealed when the camera nears it, `on-visit` stays
 * hidden/dimmed until the trail reaches it (spoiler protection in overview).
 */
export type CanvasRevealMode = 'always' | 'on-approach' | 'on-visit';

/**
 * Position and size of one panel on the plane (world units).
 */
export interface CanvasPlacement {
  x: number;
  y: number;
  w: number;
  h: number;

  /** Stacking order on the plane; overlapping panels are allowed. */
  z?: number;

  /** Rotation in degrees (-180..180). */
  r?: number;

  /** Rotation/transform origin, normalized to the placement (default 0.5/0.5). */
  origin?: { x?: number; y?: number };

  /** Panel-relative rect the camera frames when this panel becomes current. */
  enterFraming?: NormalizedRect;

  revealMode?: CanvasRevealMode;
}

/**
 * Non-panel set dressing placed on the plane. Purely presentational.
 */
export interface CanvasDecoration {
  assetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  r?: number;
  opacity?: number;

  /** Parallax factor relative to camera movement (0 = locked to the plane). */
  parallaxDepth?: number;
}

/** How a panel's framing rect is fitted into the viewport on arrival. */
export type CanvasFitMode = 'contain' | 'cover' | 'width' | 'height';

/**
 * Reader camera freedom: `off` = camera only moves along the trail
 * (webtoon-like), `between-moves` = pan/zoom while idle, `always` = fully
 * free camera.
 */
export type CanvasFreeRoam = 'off' | 'between-moves' | 'always';

export interface CanvasOverviewPolicy {
  enabled?: boolean;

  /** Lowest allowed zoom factor when zooming out to the overview. */
  maxZoomOut?: number;
}

/** Chapter-level camera behavior in canvas view. */
export interface CanvasCameraPolicy {
  fitMode?: CanvasFitMode;
  overview?: CanvasOverviewPolicy;
  freeRoam?: CanvasFreeRoam;

  /** `"auto"` = union of placements plus margin, or an explicit world rect. */
  bounds?: 'auto' | WorldRect;
}

export interface CanvasBackground {
  color?: string;
  assetId?: string;
  repeat?: 'tile' | 'stretch' | 'fixed';
}

/**
 * Infinite-canvas layout for a chapter. The graph remains the trail —
 * canvas only adds spatial position; panel-internal coordinates are
 * untouched.
 */
export interface CanvasLayout {
  background?: CanvasBackground;

  /** Map of panel id (must exist in the chapter's panels) to its placement. */
  placements: Record<string, CanvasPlacement>;

  camera?: CanvasCameraPolicy;

  decorations?: CanvasDecoration[];
}
