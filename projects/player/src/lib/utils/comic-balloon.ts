/**
 * Comic Book Balloon Renderer (TypeScript)
 * Creates dynamic speech balloons with auto-sizing and smooth tails.
 * Ported from CMS: apps/cms-frontend/src/app/core/utils/comic-balloon.ts
 */

export interface BalloonPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BalloonOptions {
  maxWidth: number;
  maxHeight: number;
  padding: BalloonPadding;
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
  tailWidth: number;
  cornerRadius: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  textAlign: string;
  isThought: boolean;
  isShout: boolean;
  isWhisper: boolean;
  /** Truly square corners (narrator caption boxes); only meaningful with cornerRadius 0. */
  sharpCorners: boolean;
  cutTop: boolean;
  cutRight: boolean;
  cutLeft: boolean;
  openTail: boolean;
  hideBorder: { angle: number; arc: number } | null;
}

export interface TailOptions {
  x?: number;
  y?: number;
  position?: number;
  length?: number;
  curve?: 'straight' | 'left' | 'right';
  curveAmount?: number;
}

export interface CutOptions {
  top?: boolean;
  right?: boolean;
  left?: boolean;
  bottom?: boolean;
}

interface PathPoint {
  x: number;
  y: number;
  origX: number;
  origY: number;
}

export interface BalloonRenderResult {
  width: number;
  height: number;
  svg: SVGSVGElement;
  balloon: ComicBalloon;
  update: (newText?: string, newTailOptions?: TailOptions | null) => BalloonRenderResult;
  updateTail: (newTailOptions: TailOptions | null) => BalloonRenderResult;
  updateText: (newText: string) => BalloonRenderResult;
}

export class ComicBalloon {
  container: HTMLElement;
  options: BalloonOptions;
  svg: SVGSVGElement | null = null;
  textElement: HTMLElement | null = null;
  balloonPath: SVGPathElement | null = null;
  tailPath: SVGPathElement | null = null;
  tailCurve = 'straight';
  tailCurveAmount = 0.4;

  constructor(container: string | HTMLElement, options: Partial<BalloonOptions> = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container) as HTMLElement
      : container;

    this.options = {
      // 0 (or any non-positive value) means "natural width", consistent with
      // maxHeight (default 0). Only a missing/non-finite value falls back to 140.
      maxWidth: typeof options.maxWidth === 'number' && Number.isFinite(options.maxWidth) ? options.maxWidth : 140,
      maxHeight: options.maxHeight || 0,
      padding: options.padding || { top: 14, right: 18, bottom: 14, left: 18 },
      strokeWidth: options.strokeWidth || 2,
      strokeColor: options.strokeColor || '#000',
      fillColor: options.fillColor || '#fff',
      tailWidth: options.tailWidth || 18,
      cornerRadius: options.cornerRadius ?? 0.45,
      fontFamily: options.fontFamily || "'Ames Italic', 'Comic Neue', sans-serif",
      fontSize: options.fontSize || 12,
      lineHeight: options.lineHeight || 1.3,
      textAlign: options.textAlign || 'center',
      isThought: options.isThought || false,
      isShout: options.isShout || false,
      isWhisper: options.isWhisper || false,
      sharpCorners: options.sharpCorners || false,
      cutTop: options.cutTop || false,
      cutRight: options.cutRight || false,
      cutLeft: options.cutLeft || false,
      openTail: options.openTail || false,
      hideBorder: options.hideBorder || null,
    };
  }

  /**
   * Render the balloon with given text and tail options
   */
  render(text: string, tailOptions: TailOptions | null = null): BalloonRenderResult {
    // Clear container
    this.container.innerHTML = '';

    // Create SVG element
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    this.svg.setAttribute('class', 'comic-balloon-svg');

    // Use the same padding as the canvas drawBalloonText (padding = 14 on each side)
    const textPadding = 14;
    const availableTextWidth = this.options.maxWidth > 0
      ? this.options.maxWidth - textPadding * 2
      : 140 - textPadding * 2;

    // Create a temporary text element to measure
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      width: ${availableTextWidth}px;
      font-family: ${this.options.fontFamily};
      font-size: ${this.options.fontSize}px;
      line-height: ${this.options.lineHeight};
      text-align: ${this.options.textAlign};
      font-style: normal;
      text-transform: uppercase;
      white-space: pre-wrap;
      word-wrap: break-word;
    `;
    tempDiv.innerHTML = text;
    document.body.appendChild(tempDiv);

    // Measure text
    const textWidth = Math.min(tempDiv.scrollWidth, availableTextWidth);
    const textHeight = tempDiv.scrollHeight;
    document.body.removeChild(tempDiv);

    // Calculate balloon dimensions
    let extraPad = 0;
    if (this.options.isShout) extraPad = Math.round(this.options.fontSize * 0.4);
    if (this.options.isThought) extraPad = Math.round(this.options.fontSize * 0.4);

    const naturalWidth = textWidth + this.options.padding.left + this.options.padding.right + extraPad * 2;
    const naturalHeight = textHeight + this.options.padding.top + this.options.padding.bottom + extraPad * 2;

    const balloonWidth = this.options.maxWidth > 0 ? this.options.maxWidth : naturalWidth;
    const balloonHeight = this.options.maxHeight > 0 ? this.options.maxHeight : naturalHeight;

    const cx = balloonWidth / 2;
    const cy = balloonHeight / 2;
    const rx = balloonWidth / 2;
    const ry = balloonHeight / 2;

    // Process tail options
    let tailTip: { x: number; y: number } | null = null;
    let tailCurve = 'straight';
    let tailCurveAmount = 0.4;

    if (tailOptions) {
      if (tailOptions.x !== undefined && tailOptions.y !== undefined) {
        tailTip = { x: tailOptions.x, y: tailOptions.y };
      } else if (tailOptions.position !== undefined) {
        const position = tailOptions.position;
        const length = tailOptions.length || 50;
        const angle = (position / 360) * Math.PI * 2 - Math.PI / 2;
        const n = 2 + (1 - this.options.cornerRadius) * 3;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const signX = cosA >= 0 ? 1 : -1;
        const signY = sinA >= 0 ? 1 : -1;
        const edgeX = cx + signX * rx * Math.pow(Math.abs(cosA), 2 / n);
        const edgeY = cy + signY * ry * Math.pow(Math.abs(sinA), 2 / n);
        const dirX = edgeX - cx;
        const dirY = edgeY - cy;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
        tailTip = {
          x: edgeX + (dirX / dirLen) * length,
          y: edgeY + (dirY / dirLen) * length,
        };
      }

      tailCurve = tailOptions.curve || 'straight';
      tailCurveAmount = tailOptions.curveAmount !== undefined ? tailOptions.curveAmount : 0.4;
    }

    this.tailCurve = tailCurve;
    this.tailCurveAmount = tailCurveAmount;

    // Calculate SVG viewBox
    const extraPadding = this.options.isThought ? 20 : (this.options.isShout ? 12 : 5);
    const strokePadding = this.options.strokeWidth + extraPadding;
    let viewBoxX = -strokePadding;
    let viewBoxY = -strokePadding;
    let viewBoxWidth = balloonWidth + strokePadding * 2;
    let viewBoxHeight = balloonHeight + strokePadding * 2;

    if (tailTip) {
      const tailPadding = 20;
      const minX = Math.min(viewBoxX, tailTip.x - tailPadding);
      const minY = Math.min(viewBoxY, tailTip.y - tailPadding);
      const maxX = Math.max(viewBoxX + viewBoxWidth, tailTip.x + tailPadding);
      const maxY = Math.max(viewBoxY + viewBoxHeight, tailTip.y + tailPadding);
      viewBoxX = minX;
      viewBoxY = minY;
      viewBoxWidth = maxX - minX;
      viewBoxHeight = maxY - minY;
    }

    this.svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
    this.svg.style.width = viewBoxWidth + 'px';
    this.svg.style.height = viewBoxHeight + 'px';
    this.svg.style.overflow = 'visible';

    // Create balloon path
    let balloonPath: string | { fill: string; stroke: string };
    if (this.options.isThought) {
      balloonPath = this.createThoughtBalloonPath(cx, cy, balloonWidth, balloonHeight);
    } else if (this.options.isShout) {
      balloonPath = this.createShoutBalloonPath(cx, cy, balloonWidth, balloonHeight, tailTip);
    } else {
      const cutOpts: CutOptions = {
        top: this.options.cutTop,
        right: this.options.cutRight,
        left: this.options.cutLeft,
      };
      balloonPath = this.createSquirclePath(cx, cy, balloonWidth, balloonHeight, this.options.cornerRadius, tailTip, cutOpts);
    }

    // Create the balloon path element(s)
    const isObjectPath = typeof balloonPath === 'object' && (balloonPath as { fill: string }).fill;
    const needSeparatePaths = isObjectPath || this.options.hideBorder;

    if (needSeparatePaths) {
      const objPath = balloonPath as { fill: string; stroke: string };
      const fillD = isObjectPath ? objPath.fill : (balloonPath as string);
      const strokeD = isObjectPath ? objPath.stroke : (balloonPath as string);

      // Fill element (closed path, no stroke)
      const fillEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      fillEl.setAttribute('d', fillD);
      fillEl.setAttribute('fill', this.options.fillColor);
      fillEl.setAttribute('stroke', 'none');
      this.svg.appendChild(fillEl);

      // Stroke element (no fill)
      this.balloonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.balloonPath.setAttribute('d', strokeD);
      this.balloonPath.setAttribute('fill', 'none');
      this.balloonPath.setAttribute('stroke', this.options.strokeColor);
      this.balloonPath.setAttribute('stroke-width', String(this.options.strokeWidth));
      this.balloonPath.setAttribute('stroke-linejoin', 'round');
      this.balloonPath.setAttribute('stroke-linecap', 'round');

      if (this.options.isWhisper) {
        this.balloonPath.setAttribute('stroke-dasharray', '6 4');
      }

      // Apply clip-path to hide a border segment
      if (this.options.hideBorder) {
        const { angle: hideAngle, arc: hideArc } = this.options.hideBorder;
        const startVisible = hideAngle + hideArc / 2;
        const visibleArc = 360 - hideArc;
        const R = Math.max(viewBoxWidth, viewBoxHeight) * 2;
        const clipId = 'hide-clip-' + Math.random().toString(36).substr(2, 9);

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPathEl.setAttribute('id', clipId);

        let pts = `${cx.toFixed(2)},${cy.toFixed(2)}`;
        const steps = 36;
        for (let i = 0; i <= steps; i++) {
          const deg = startVisible + (i / steps) * visibleArc;
          const rad = (deg / 360) * Math.PI * 2 - Math.PI / 2;
          pts += ` ${(cx + R * Math.cos(rad)).toFixed(2)},${(cy + R * Math.sin(rad)).toFixed(2)}`;
        }

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', pts);
        clipPathEl.appendChild(polygon);
        defs.appendChild(clipPathEl);
        this.svg.appendChild(defs);

        this.balloonPath.setAttribute('clip-path', `url(#${clipId})`);
      }

      this.svg.appendChild(this.balloonPath);
    } else {
      this.balloonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.balloonPath.setAttribute('d', balloonPath as string);
      this.balloonPath.setAttribute('fill', this.options.fillColor);
      this.balloonPath.setAttribute('stroke', this.options.strokeColor);
      this.balloonPath.setAttribute('stroke-width', String(this.options.strokeWidth));
      this.balloonPath.setAttribute('stroke-linejoin', 'round');
      this.balloonPath.setAttribute('stroke-linecap', 'round');

      if (this.options.isWhisper) {
        this.balloonPath.setAttribute('stroke-dasharray', '6 4');
      }

      this.svg.appendChild(this.balloonPath);
    }

    // Add thought bubbles if thought balloon
    if (this.options.isThought && tailTip) {
      this.addThoughtBubbles(cx, cy, balloonWidth, balloonHeight, tailTip);
    }

    // Create text element using foreignObject
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');

    // Center text within the balloon (matching canvas drawBalloonText behavior)
    const foX = (balloonWidth - textWidth) / 2;
    const foY = (balloonHeight - textHeight) / 2;
    foreignObject.setAttribute('x', String(foX));
    foreignObject.setAttribute('y', String(foY));
    foreignObject.setAttribute('width', String(textWidth));
    foreignObject.setAttribute('height', String(textHeight));

    const textDiv = document.createElement('div');
    textDiv.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    textDiv.style.cssText = `
      font-family: ${this.options.fontFamily};
      font-size: ${this.options.fontSize}px;
      line-height: ${this.options.lineHeight};
      text-align: ${this.options.textAlign};
      font-style: normal;
      text-transform: uppercase;
      color: #000;
    `;
    textDiv.innerHTML = text;

    foreignObject.appendChild(textDiv);
    this.svg.appendChild(foreignObject);

    this.container.appendChild(this.svg);

    return {
      width: balloonWidth,
      height: balloonHeight,
      svg: this.svg,
      balloon: this,
      update: (newText?: string, newTailOptions?: TailOptions | null) =>
        this.render(newText || text, newTailOptions !== undefined ? newTailOptions : tailOptions),
      updateTail: (newTailOptions: TailOptions | null) => this.render(text, newTailOptions),
      updateText: (newText: string) => this.render(newText, tailOptions),
    };
  }

  /**
   * Create a "squircle" path - hybrid between ellipse and rounded rectangle
   */
  createSquirclePath(
    cx: number, cy: number,
    width: number, height: number,
    cornerRadius = 0.4,
    tailTip: { x: number; y: number } | null = null,
    cutOptions: CutOptions = {}
  ): string | { fill: string; stroke: string } {
    const rx = width / 2;
    const ry = height / 2;
    const numPoints = 180;
    const points: PathPoint[] = [];

    if (cornerRadius === 0) {
      // sharpCorners (narrator boxes) => truly square corners; otherwise a
      // small 8px rounding keeps the 'rectangle' type friendly.
      const r = this.options.sharpCorners ? 0 : Math.min(8, rx, ry);
      const edgeT = Math.max(0, 2 * rx - 2 * r);
      const edgeR = Math.max(0, 2 * ry - 2 * r);
      const arc = (Math.PI / 2) * r;
      const perim = 2 * edgeT + 2 * edgeR + 4 * arc;

      const segments: { type: string; len: number; start?: { x: number; y: number }; end?: { x: number; y: number }; center?: { x: number; y: number }; startAngle?: number; endAngle?: number }[] = [
        { type: 'line', len: edgeR / 2, start: { x: cx - rx, y: cy }, end: { x: cx - rx, y: cy - ry + r } },
        { type: 'arc', len: arc, center: { x: cx - rx + r, y: cy - ry + r }, startAngle: Math.PI, endAngle: Math.PI * 1.5 },
        { type: 'line', len: edgeT, start: { x: cx - rx + r, y: cy - ry }, end: { x: cx + rx - r, y: cy - ry } },
        { type: 'arc', len: arc, center: { x: cx + rx - r, y: cy - ry + r }, startAngle: -Math.PI / 2, endAngle: 0 },
        { type: 'line', len: edgeR, start: { x: cx + rx, y: cy - ry + r }, end: { x: cx + rx, y: cy + ry - r } },
        { type: 'arc', len: arc, center: { x: cx + rx - r, y: cy + ry - r }, startAngle: 0, endAngle: Math.PI / 2 },
        { type: 'line', len: edgeT, start: { x: cx + rx - r, y: cy + ry }, end: { x: cx - rx + r, y: cy + ry } },
        { type: 'arc', len: arc, center: { x: cx - rx + r, y: cy + ry - r }, startAngle: Math.PI / 2, endAngle: Math.PI },
        { type: 'line', len: edgeR / 2, start: { x: cx - rx, y: cy + ry - r }, end: { x: cx - rx, y: cy } },
      ];

      for (let i = 0; i < numPoints; i++) {
        const d = (i / numPoints) * perim;
        let currentD = 0;
        let p: { x: number; y: number } | null = null;
        for (const seg of segments) {
          if (d <= currentD + seg.len || seg === segments[segments.length - 1]) {
            const t = seg.len > 0 ? (d - currentD) / seg.len : 0;
            if (seg.type === 'line') {
              p = {
                x: seg.start!.x + (seg.end!.x - seg.start!.x) * t,
                y: seg.start!.y + (seg.end!.y - seg.start!.y) * t,
              };
            } else {
              const angle = seg.startAngle! + (seg.endAngle! - seg.startAngle!) * t;
              p = {
                x: seg.center!.x + r * Math.cos(angle),
                y: seg.center!.y + r * Math.sin(angle),
              };
            }
            break;
          }
          currentD += seg.len;
        }

        let x = p!.x;
        let y = p!.y;
        if (cutOptions.top && y < cy - ry + 1) y = cy - ry;
        if (cutOptions.right && x > cx + rx - 1) x = cx + rx;
        if (cutOptions.left && x < cx - rx + 1) x = cx - rx;
        if (cutOptions.bottom && y > cy + ry - 1) y = cy + ry;

        points.push({ x, y, origX: p!.x, origY: p!.y });
      }
    } else {
      const n = 2 + (1 - cornerRadius) * 3;
      const stretchFactor = 1.3;

      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2 - Math.PI;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const signX = cosA >= 0 ? 1 : -1;
        const signY = sinA >= 0 ? 1 : -1;

        let currentRx = rx;
        let currentRy = ry;
        if (cutOptions.top && signY < 0) currentRy = ry * stretchFactor;
        if (cutOptions.bottom && signY > 0) currentRy = ry * stretchFactor;
        if (cutOptions.right && signX > 0) currentRx = rx * stretchFactor;
        if (cutOptions.left && signX < 0) currentRx = rx * stretchFactor;

        const origX = cx + signX * currentRx * Math.pow(Math.abs(cosA), 2 / n);
        const origY = cy + signY * currentRy * Math.pow(Math.abs(sinA), 2 / n);

        let x = origX;
        let y = origY;
        if (cutOptions.top && y < cy - ry + 1) y = cy - ry;
        if (cutOptions.right && x > cx + rx - 1) x = cx + rx;
        if (cutOptions.left && x < cx - rx + 1) x = cx - rx;
        if (cutOptions.bottom && y > cy + ry - 1) y = cy + ry;

        points.push({ x, y, origX, origY });
      }
    }

    // Remove duplicate points created by clamping
    const filteredPoints: PathPoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (filteredPoints.length === 0) {
        filteredPoints.push(p);
      } else {
        const lastP = filteredPoints[filteredPoints.length - 1];
        const distSq = (p.x - lastP.x) ** 2 + (p.y - lastP.y) ** 2;
        if (distSq > 0.1 || i === points.length - 1) {
          filteredPoints.push(p);
        }
      }
    }

    const numFilteredPoints = filteredPoints.length;

    // If no tail, create simple path
    if (!tailTip) {
      let path = `M ${filteredPoints[0].x.toFixed(2)} ${filteredPoints[0].y.toFixed(2)}`;
      for (let i = 1; i < numFilteredPoints; i++) {
        path += ` L ${filteredPoints[i].x.toFixed(2)} ${filteredPoints[i].y.toFixed(2)}`;
      }
      path += ' Z';
      return path;
    }

    // Find the path point whose angle matches tail angle
    const tailAngle = Math.atan2(tailTip.y - cy, tailTip.x - cx);
    let centerIdx = 0;
    let minAngleDiff = Infinity;
    for (let i = 0; i < numFilteredPoints; i++) {
      const actualAngle = Math.atan2(filteredPoints[i].origY - cy, filteredPoints[i].origX - cx);
      const diff = Math.abs(this.normalizeAngle(actualAngle - tailAngle));
      if (diff < minAngleDiff) {
        minAngleDiff = diff;
        centerIdx = i;
      }
    }

    // Find base points (connector/open tails are drawn narrower than pointed tails)
    const tailHalfWidth = this.options.openTail ? 5 : (cornerRadius === 0 ? 5 : 8);
    let idx1 = (centerIdx - 1 + numFilteredPoints) % numFilteredPoints;
    let idx2 = (centerIdx + 1) % numFilteredPoints;
    const centerPt = filteredPoints[centerIdx];

    for (let step = 1; step < numFilteredPoints / 2; step++) {
      const testIdx = (centerIdx - step + numFilteredPoints) % numFilteredPoints;
      const dist = Math.hypot(filteredPoints[testIdx].x - centerPt.x, filteredPoints[testIdx].y - centerPt.y);
      if (dist >= tailHalfWidth) {
        idx1 = testIdx;
        break;
      }
    }

    for (let step = 1; step < numFilteredPoints / 2; step++) {
      const testIdx = (centerIdx + step) % numFilteredPoints;
      const dist = Math.hypot(filteredPoints[testIdx].x - centerPt.x, filteredPoints[testIdx].y - centerPt.y);
      if (dist >= tailHalfWidth) {
        idx2 = testIdx;
        break;
      }
    }

    if (idx1 === idx2) {
      idx2 = (idx1 + 1) % numFilteredPoints;
    }

    const lowerBase = Math.min(idx1, idx2);
    const higherBase = Math.max(idx1, idx2);
    const directDist = higherBase - lowerBase;
    const wrapDist = numFilteredPoints - directDist;
    const isWrap = wrapDist < directDist;

    // Open tail: return separate fill (closed) and stroke (open) paths
    if (this.options.openTail) {
      const tdx = tailTip.x - cx;
      const tdy = tailTip.y - cy;
      const tdLen = Math.sqrt(tdx * tdx + tdy * tdy);
      const perpX = -tdy / tdLen;
      const perpY = tdx / tdLen;
      const openHW = tailHalfWidth;

      let end1 = { x: tailTip.x + perpX * openHW, y: tailTip.y + perpY * openHW };
      let end2 = { x: tailTip.x - perpX * openHW, y: tailTip.y - perpY * openHW };

      const d1 = Math.hypot(end1.x - filteredPoints[lowerBase].x, end1.y - filteredPoints[lowerBase].y);
      const d2 = Math.hypot(end2.x - filteredPoints[lowerBase].x, end2.y - filteredPoints[lowerBase].y);
      if (d1 > d2) [end1, end2] = [end2, end1];

      let strokePath: string;

      if (isWrap) {
        strokePath = `M ${end1.x.toFixed(2)} ${end1.y.toFixed(2)}`;
        strokePath += ` L ${filteredPoints[lowerBase].x.toFixed(2)} ${filteredPoints[lowerBase].y.toFixed(2)}`;
        for (let i = lowerBase + 1; i <= higherBase; i++) {
          strokePath += ` L ${filteredPoints[i].x.toFixed(2)} ${filteredPoints[i].y.toFixed(2)}`;
        }
        strokePath += ` L ${end2.x.toFixed(2)} ${end2.y.toFixed(2)}`;
      } else {
        strokePath = `M ${end2.x.toFixed(2)} ${end2.y.toFixed(2)}`;
        strokePath += ` L ${filteredPoints[higherBase].x.toFixed(2)} ${filteredPoints[higherBase].y.toFixed(2)}`;
        for (let i = higherBase + 1; i < numFilteredPoints; i++) {
          strokePath += ` L ${filteredPoints[i].x.toFixed(2)} ${filteredPoints[i].y.toFixed(2)}`;
        }
        for (let i = 0; i <= lowerBase; i++) {
          strokePath += ` L ${filteredPoints[i].x.toFixed(2)} ${filteredPoints[i].y.toFixed(2)}`;
        }
        strokePath += ` L ${end1.x.toFixed(2)} ${end1.y.toFixed(2)}`;
      }

      return { fill: strokePath + ' Z', stroke: strokePath };
    }

    // Build tail path segment helper
    const curve = this.tailCurve || 'straight';
    // `??` (not `||`): an explicit curveAmount of 0 is a valid, deliberate value.
    const curveAmount = this.tailCurveAmount ?? 0.4;

    const buildTailSegment = (fromPt: PathPoint, toPt: PathPoint): string => {
      const midX = (fromPt.x + toPt.x) / 2;
      const midY = (fromPt.y + toPt.y) / 2;
      const dx = tailTip!.x - midX;
      const dy = tailTip!.y - midY;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (curve === 'straight' || len < 1) {
        return ` L ${tailTip!.x.toFixed(2)} ${tailTip!.y.toFixed(2)} L ${toPt.x.toFixed(2)} ${toPt.y.toFixed(2)}`;
      }

      const perpXC = -dy / len;
      const perpYC = dx / len;
      const curveDir = curve === 'left' ? -1 : 1;
      const curveOffset = len * curveAmount * 0.3 * curveDir;
      const mid1X = (fromPt.x + tailTip!.x) / 2;
      const mid1Y = (fromPt.y + tailTip!.y) / 2;
      const ctrl1X = mid1X + perpXC * curveOffset;
      const ctrl1Y = mid1Y + perpYC * curveOffset;
      const mid2X = (tailTip!.x + toPt.x) / 2;
      const mid2Y = (tailTip!.y + toPt.y) / 2;
      const ctrl2X = mid2X + perpXC * curveOffset;
      const ctrl2Y = mid2Y + perpYC * curveOffset;
      return ` Q ${ctrl1X.toFixed(2)} ${ctrl1Y.toFixed(2)} ${tailTip!.x.toFixed(2)} ${tailTip!.y.toFixed(2)} Q ${ctrl2X.toFixed(2)} ${ctrl2Y.toFixed(2)} ${toPt.x.toFixed(2)} ${toPt.y.toFixed(2)}`;
    };

    let path: string;

    if (isWrap) {
      const startIdx = lowerBase + 1;
      if (startIdx >= higherBase) {
        path = `M ${filteredPoints[0].x.toFixed(2)} ${filteredPoints[0].y.toFixed(2)}`;
        for (let i = 1; i < numFilteredPoints; i++) {
          path += ` L ${filteredPoints[i].x.toFixed(2)} ${filteredPoints[i].y.toFixed(2)}`;
        }
        path += ' Z';
      } else {
        path = `M ${filteredPoints[startIdx].x.toFixed(2)} ${filteredPoints[startIdx].y.toFixed(2)}`;
        for (let i = startIdx + 1; i <= higherBase; i++) {
          path += ` L ${filteredPoints[i].x.toFixed(2)} ${filteredPoints[i].y.toFixed(2)}`;
        }
        path += buildTailSegment(filteredPoints[higherBase], filteredPoints[lowerBase]);
        path += ' Z';
      }
    } else {
      path = `M ${filteredPoints[0].x.toFixed(2)} ${filteredPoints[0].y.toFixed(2)}`;
      for (let i = 1; i <= lowerBase; i++) {
        path += ` L ${filteredPoints[i].x.toFixed(2)} ${filteredPoints[i].y.toFixed(2)}`;
      }
      path += buildTailSegment(filteredPoints[lowerBase], filteredPoints[higherBase]);
      for (let i = higherBase + 1; i < numFilteredPoints; i++) {
        path += ` L ${filteredPoints[i].x.toFixed(2)} ${filteredPoints[i].y.toFixed(2)}`;
      }
      path += ' Z';
    }

    return path;
  }

  /** Normalize angle to -PI to PI range */
  normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  /** Create thought balloon (cloud shape with bumpy outline) */
  createThoughtBalloonPath(cx: number, cy: number, width: number, height: number): string {
    const rx = width / 2;
    const ry = height / 2;

    const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const avgRadius = (rx + ry) / 2;
    const sizeFactor = Math.max(0.4, Math.min(1, avgRadius / 80));
    const targetBumpLength = 35 / sizeFactor;
    const bumps = Math.max(6, Math.floor(perimeter / targetBumpLength));

    const points: { x: number; y: number }[] = [];
    const pseudoRandom = (i: number) => {
      const x = Math.sin(i * 9999.99) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < bumps; i++) {
      const t = i / bumps;
      const angleOffset = (pseudoRandom(i) - 0.5) * (Math.PI * 2 / bumps) * 0.4;
      const angle = t * Math.PI * 2 + angleOffset;
      const x = cx + rx * Math.cos(angle);
      const y = cy + ry * Math.sin(angle);
      points.push({ x, y });
    }

    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 0; i < bumps; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % bumps];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dy / dist;
      const ny = -dx / dist;
      const bumpOut = dist * (0.3 + 0.3 * sizeFactor);
      const cp1x = p1.x + dx * 0.2 + nx * bumpOut;
      const cp1y = p1.y + dy * 0.2 + ny * bumpOut;
      const cp2x = p1.x + dx * 0.8 + nx * bumpOut;
      const cp2y = p1.y + dy * 0.8 + ny * bumpOut;
      path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    path += ' Z';
    return path;
  }

  /** Add thought bubble tail (small ellipses leading to tail tip) */
  addThoughtBubbles(cx: number, cy: number, width: number, height: number, tailTip: { x: number; y: number }): void {
    const numBubbles = 3;
    const rx = width / 2;
    const ry = height / 2;

    const angle = Math.atan2(tailTip.y - cy, tailTip.x - cx);
    const edgeX = cx + (rx + 5) * Math.cos(angle);
    const edgeY = cy + (ry + 5) * Math.sin(angle);

    const dx = tailTip.x - edgeX;
    const dy = tailTip.y - edgeY;

    const bubbleSizes = [8, 5, 3];

    for (let i = 0; i < numBubbles; i++) {
      const t = (i + 1) / numBubbles;
      const adjustedT = 0.2 + t * 0.8;

      const bubbleX = edgeX + dx * adjustedT;
      const bubbleY = edgeY + dy * adjustedT;
      const bubbleR = bubbleSizes[i];

      const bubble = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bubble.setAttribute('cx', bubbleX.toFixed(2));
      bubble.setAttribute('cy', bubbleY.toFixed(2));
      bubble.setAttribute('r', String(bubbleR));
      bubble.setAttribute('fill', this.options.fillColor);
      bubble.setAttribute('stroke', this.options.strokeColor);
      bubble.setAttribute('stroke-width', String(this.options.strokeWidth));

      this.svg!.appendChild(bubble);
    }
  }

  /** Create shout balloon (jagged/burst edges) */
  createShoutBalloonPath(
    cx: number, cy: number,
    width: number, height: number,
    tailTip: { x: number; y: number } | null = null
  ): string {
    const rx = width / 2 + 10;
    const ry = height / 2 + 10;

    const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const targetSpikeWidth = 25;
    const spikes = Math.max(10, Math.floor(perimeter / targetSpikeWidth));

    const points: { x: number; y: number; angle: number }[] = [];
    const numPoints = spikes * 2;

    const pseudoRandom = (i: number) => {
      const x = Math.sin(i * 1234.56) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints;
      const isPeak = i % 2 === 0;
      const angleOffset = (pseudoRandom(i) - 0.5) * (Math.PI * 2 / numPoints) * 0.5;
      const angle = t * Math.PI * 2 + angleOffset - Math.PI;
      const peakOut = 15 + pseudoRandom(i + 100) * 15;
      const valleyIn = 0 + pseudoRandom(i + 200) * 10;
      const offset = isPeak ? peakOut : -valleyIn;
      const x = cx + (rx + offset) * Math.cos(angle);
      const y = cy + (ry + offset) * Math.sin(angle);
      points.push({ x, y, angle });
    }

    if (tailTip) {
      const tailAngle = Math.atan2(tailTip.y - cy, tailTip.x - cx);
      let closestPeakIdx = 0;
      let minAngleDiffS = Infinity;

      for (let i = 0; i < numPoints; i += 2) {
        const actualAngle = Math.atan2(points[i].y - cy, points[i].x - cx);
        const diff = Math.abs(this.normalizeAngle(actualAngle - tailAngle));
        if (diff < minAngleDiffS) {
          minAngleDiffS = diff;
          closestPeakIdx = i;
        }
      }

      points[closestPeakIdx] = {
        x: tailTip.x,
        y: tailTip.y,
        angle: points[closestPeakIdx].angle,
      };
    }

    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
    }
    path += ' Z';
    return path;
  }
}

/** Helper function to create a balloon quickly */
export function createBalloon(
  containerSelector: string | HTMLElement,
  text: string,
  tailOptions: TailOptions | null,
  options: Partial<BalloonOptions> = {}
): BalloonRenderResult {
  const balloon = new ComicBalloon(containerSelector, options);
  return balloon.render(text, tailOptions);
}
