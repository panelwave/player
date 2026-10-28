// SYNCED FROM panelwave-cms/apps/cms-frontend/src/app/core/utils/balloon-geometry.ts — DO NOT EDIT HERE.
// Edit the CMS copy, then run in panelwave-cms: npm run sync:balloon

/**
 * Pure geometry helpers shared by the canvas renderer and the speech-bubble
 * service so the draggable tail handle and the drawn ComicBalloon tail always
 * agree. Compass convention (same as ComicBalloon / TailConfig):
 * 0° = top, 90° = right, 180° = bottom, 270° = left.
 */

export interface BalloonCenterBounds {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/**
 * Point on the squircle (superellipse) edge for a compass angle.
 * Same formula as ComicBalloon.createSquirclePath / drawBubbleBalloon:
 * exponent n = 2 + (1 - cornerRadius) * 3.
 */
export function squircleEdgePoint(
  bounds: BalloonCenterBounds,
  positionDeg: number,
  cornerRadius: number
): { x: number; y: number } {
  const angle = (positionDeg / 360) * Math.PI * 2 - Math.PI / 2;
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  const n = 2 + (1 - cornerRadius) * 3;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const signX = cosA >= 0 ? 1 : -1;
  const signY = sinA >= 0 ? 1 : -1;
  return {
    x: bounds.cx + signX * rx * Math.pow(Math.abs(cosA), 2 / n),
    y: bounds.cy + signY * ry * Math.pow(Math.abs(sinA), 2 / n),
  };
}

/** Tail tip position for an angle-based TailConfig (position/length). */
export function tailConfigToTip(
  bounds: BalloonCenterBounds,
  tail: { position: number; length: number },
  cornerRadius: number
): { x: number; y: number } {
  const edge = squircleEdgePoint(bounds, tail.position, cornerRadius);
  const dirX = edge.x - bounds.cx;
  const dirY = edge.y - bounds.cy;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  return {
    x: edge.x + (dirX / dirLen) * tail.length,
    y: edge.y + (dirY / dirLen) * tail.length,
  };
}

/**
 * Trail circles for a thought balloon: three shrinking bubbles from the cloud
 * edge toward the tail tip. Shared by ComicBalloon.addThoughtBubbles (SVG) and
 * InteractionRenderer.drawBubbleBalloon (canvas) so preview and editor agree —
 * the trail is NOT part of the cloud path, each renderer draws it separately.
 */
export function thoughtTrailCircles(
  bounds: BalloonCenterBounds,
  tailTip: { x: number; y: number },
  /** Design-px → output-px factor of the balloon (the circles are design px). */
  scale = 1
): { x: number; y: number; r: number }[] {
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;

  const angle = Math.atan2(tailTip.y - bounds.cy, tailTip.x - bounds.cx);
  const edgeX = bounds.cx + (rx + 5 * scale) * Math.cos(angle);
  const edgeY = bounds.cy + (ry + 5 * scale) * Math.sin(angle);

  const dx = tailTip.x - edgeX;
  const dy = tailTip.y - edgeY;

  const sizes = [8 * scale, 5 * scale, 3 * scale];
  return sizes.map((r, i) => {
    const t = (i + 1) / sizes.length;
    const adjustedT = 0.2 + t * 0.8;
    return { x: edgeX + dx * adjustedT, y: edgeY + dy * adjustedT, r };
  });
}

/**
 * Inverse mapping: a dragged pixel tail tip → compass position (0-359, integer)
 * and length (px from the squircle edge, >= 0).
 */
export function tailTipToTailConfig(
  bounds: BalloonCenterBounds,
  tipX: number,
  tipY: number,
  cornerRadius: number
): { position: number; length: number } {
  const dx = tipX - bounds.cx;
  const dy = tipY - bounds.cy;
  const rx = bounds.width / 2 || 1;
  const ry = bounds.height / 2 || 1;
  const n = 2 + (1 - cornerRadius) * 3;

  // The tip lies on the ray center → edge(param), so invert the superellipse
  // parameterization: find the param angle whose edge point has the same
  // geometric direction as the tip. (The param angle is NOT atan2(dy, dx)
  // when width ≠ height.)
  let alpha: number;
  if (Math.abs(dx) < 1e-9) {
    alpha = dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    const alpha0 = Math.atan(Math.pow((rx / ry) * Math.abs(dy / dx), n / 2));
    if (dx >= 0) {
      alpha = dy >= 0 ? alpha0 : -alpha0;
    } else {
      alpha = dy >= 0 ? Math.PI - alpha0 : Math.PI + alpha0;
    }
  }

  // Param angle → compass degrees (the forward map is angle = pos/360·2π − π/2).
  let position = (alpha * 180) / Math.PI + 90;
  position = Math.round(position);
  position = ((position % 360) + 360) % 360;

  const edge = squircleEdgePoint(bounds, position, cornerRadius);
  const edgeDist = Math.hypot(edge.x - bounds.cx, edge.y - bounds.cy);
  const tipDist = Math.hypot(dx, dy);
  const length = Math.round(Math.max(0, tipDist - edgeDist));
  return { position, length };
}

// ---------------------------------------------------------------------------
// Auto-grow placement (schema 1.8 textFit): where a body that grew beyond its
// authored size goes. Shared by the player overlay, the editor panel view and
// the editor page view so all three move a grown balloon the same way.
// ---------------------------------------------------------------------------

export interface BalloonRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Edges of the authored box that must stay where they are when the body grows. */
export interface GlueEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

/**
 * Edges the authored box touches (within `eps`) on the panel, plus the edges
 * a caption type is glued to by definition: the cut Panel-Top variants always
 * keep the top (the cut edge IS the panel border), the corner variants their side.
 */
export function grownBodyGlue(
  authored: BalloonRectLike,
  panel: BalloonRectLike | null,
  balloonType?: string,
  eps?: number,
): GlueEdges {
  const glue: GlueEdges = {};
  if (panel) {
    const e = eps ?? Math.max(4, 0.02 * Math.min(panel.width, panel.height));
    if (authored.x <= panel.x + e) glue.left = true;
    else if (authored.x + authored.width >= panel.x + panel.width - e) glue.right = true;
    if (authored.y <= panel.y + e) glue.top = true;
    else if (authored.y + authored.height >= panel.y + panel.height - e) glue.bottom = true;
  }
  if (balloonType === 'cutTop' || balloonType === 'cutTopLeft' || balloonType === 'cutTopRight') {
    glue.top = true;
    glue.bottom = false;
    if (balloonType === 'cutTopLeft') { glue.left = true; glue.right = false; }
    if (balloonType === 'cutTopRight') { glue.right = true; glue.left = false; }
  }
  return glue;
}

/**
 * Rect of a grown body (`grown` size) so that
 * 1. a tail balloon keeps its tail tip where the authored box put it (the
 *    body moves away from the speaker, the tail keeps angle and length);
 * 2. glued edges stay on the panel border (overrides 1 on that axis);
 * 3. a tailless, unglued balloon keeps its centre;
 * 4. the body stays inside `panel` when one is given (centred on an axis it
 *    cannot fit) — this is the only rule that may move the tail tip.
 * Returns the authored rect itself when the size did not change.
 */
export function placeGrownBody(
  authored: BalloonRectLike,
  grown: { width: number; height: number },
  tail: { position: number; length: number } | null,
  cornerRadius: number,
  panel: BalloonRectLike | null,
  glue: GlueEdges = {},
): BalloonRectLike {
  if (Math.abs(grown.width - authored.width) < 0.5 && Math.abs(grown.height - authored.height) < 0.5) {
    return { ...authored };
  }
  const cx = authored.x + authored.width / 2;
  const cy = authored.y + authored.height / 2;
  let x = cx - grown.width / 2;
  let y = cy - grown.height / 2;

  if (tail) {
    const tipAuthored = tailConfigToTip({ cx, cy, width: authored.width, height: authored.height }, tail, cornerRadius);
    const tipGrown = tailConfigToTip({ cx, cy, width: grown.width, height: grown.height }, tail, cornerRadius);
    x += tipAuthored.x - tipGrown.x;
    y += tipAuthored.y - tipGrown.y;
  }

  if (glue.left) x = authored.x;
  else if (glue.right) x = authored.x + authored.width - grown.width;
  if (glue.top) y = authored.y;
  else if (glue.bottom) y = authored.y + authored.height - grown.height;

  if (panel) {
    if (grown.width >= panel.width) x = panel.x + (panel.width - grown.width) / 2;
    else x = Math.min(panel.x + panel.width - grown.width, Math.max(panel.x, x));
    if (grown.height >= panel.height) y = panel.y + (panel.height - grown.height) / 2;
    else y = Math.min(panel.y + panel.height - grown.height, Math.max(panel.y, y));
  }

  return { x, y, width: grown.width, height: grown.height };
}

/**
 * Rect of a body boosted by `boost` (>= 1) for readability — the same balloon,
 * larger — so that
 * 1. a tail balloon keeps its tail tip. With `scaleTail` the whole balloon,
 *    tail included, is scaled about the tip (a tail of `length × boost` from
 *    the boosted body ends on the authored tip — panel view). Without it the
 *    body is scaled about the tip of the balloon drawn with a `length / boost`
 *    tail, so a tail of the authored `length` from the boosted body ends on
 *    the authored tip (the body moves away from the speaker, the visible tail
 *    keeps its length — page view's tail counter-scaling);
 * 2. glued edges stay on the panel border (overrides 1 on that axis);
 * 3. a tailless, unglued balloon keeps its centre;
 * 4. a TAILLESS body stays inside `panel` when one is given (centred on an
 *    axis it cannot fit). A tail balloon is never moved off its tip here —
 *    see fitBoostedBody, which lowers the boost instead.
 * Returns the authored rect itself for boost <= 1.
 */
export function placeBoostedBody(
  authored: BalloonRectLike,
  boost: number,
  tail: { position: number; length: number } | null,
  cornerRadius: number,
  panel: BalloonRectLike | null,
  glue: GlueEdges = {},
  scaleTail = false,
): BalloonRectLike {
  if (!(boost > 1.0005)) return { ...authored };
  const cx = authored.x + authored.width / 2;
  const cy = authored.y + authored.height / 2;
  const width = authored.width * boost;
  const height = authored.height * boost;
  let x = cx - width / 2;
  let y = cy - height / 2;

  if (tail) {
    const bounds = { cx, cy, width: authored.width, height: authored.height };
    const tip = tailConfigToTip(bounds, tail, cornerRadius);
    // Scale about the point that must stay: the tip itself when the tail
    // scales along, else the tip of the shortened tail; then move it onto
    // the authored tip.
    const pivot = scaleTail
      ? tip
      : tailConfigToTip(bounds, { position: tail.position, length: tail.length / boost }, cornerRadius);
    x = tip.x + (authored.x - pivot.x) * boost;
    y = tip.y + (authored.y - pivot.y) * boost;
  }

  if (glue.left) x = authored.x;
  else if (glue.right) x = authored.x + authored.width - width;
  if (glue.top) y = authored.y;
  else if (glue.bottom) y = authored.y + authored.height - height;

  if (panel && !tail) {
    if (width >= panel.width) x = panel.x + (panel.width - width) / 2;
    else x = Math.min(panel.x + panel.width - width, Math.max(panel.x, x));
    if (height >= panel.height) y = panel.y + (panel.height - height) / 2;
    else y = Math.min(panel.y + panel.height - height, Math.max(panel.y, y));
  }

  return { x, y, width, height };
}

/** True when `rect` lies inside `panel` (half a pixel of tolerance). */
export function rectInside(rect: BalloonRectLike, panel: BalloonRectLike, eps = 0.5): boolean {
  return rect.x >= panel.x - eps && rect.y >= panel.y - eps
    && rect.x + rect.width <= panel.x + panel.width + eps
    && rect.y + rect.height <= panel.y + panel.height + eps;
}

/**
 * placeBoostedBody with the boost lowered (towards 1) until a TAIL balloon's
 * body fits inside `panel` with its tip kept on the speaker — a balloon must
 * stay inside its panel, and only the boost is negotiable. When even the
 * authored body does not fit (the author placed it over the border) the
 * requested boost is kept and the body may overhang as authored. Returns the
 * boost actually used.
 */
export function fitBoostedBody(
  authored: BalloonRectLike,
  boost: number,
  tail: { position: number; length: number } | null,
  cornerRadius: number,
  panel: BalloonRectLike | null,
  glue: GlueEdges = {},
  scaleTail = false,
): { rect: BalloonRectLike; boost: number } {
  let rect = placeBoostedBody(authored, boost, tail, cornerRadius, panel, glue, scaleTail);
  if (!panel || !tail || boost <= 1.0005 || rectInside(rect, panel) || !rectInside(authored, panel)) {
    return { rect, boost: boost > 1.0005 ? boost : 1 };
  }
  let lo = 1;
  let hi = boost;
  rect = { ...authored };
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    const candidate = placeBoostedBody(authored, mid, tail, cornerRadius, panel, glue, scaleTail);
    if (rectInside(candidate, panel)) { lo = mid; rect = candidate; } else { hi = mid; }
  }
  return { rect, boost: lo };
}
