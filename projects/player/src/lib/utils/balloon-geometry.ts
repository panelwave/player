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
  tailTip: { x: number; y: number }
): { x: number; y: number; r: number }[] {
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;

  const angle = Math.atan2(tailTip.y - bounds.cy, tailTip.x - bounds.cx);
  const edgeX = bounds.cx + (rx + 5) * Math.cos(angle);
  const edgeY = bounds.cy + (ry + 5) * Math.sin(angle);

  const dx = tailTip.x - edgeX;
  const dy = tailTip.y - edgeY;

  const sizes = [8, 5, 3];
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
