/**
 * Hotspots Overlay Component
 * Renders a panel's interactive hotspots (manifest shape, normalized 0-1
 * geometry) on top of the panel content, mirroring the speech-bubbles
 * overlay contract: absolutely positioned host, container dimensions from
 * the parent, pointer events enabled per shape only.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges,
} from '@angular/core';

import type {
  Hotspot,
  HotspotShape,
  HotspotRect,
  HotspotCircle,
  HotspotPolygon,
  LocalizedString,
} from '../../../types';
import type { VariableContext } from '../../../types';
import { evaluateJsonLogic, resolveLocalizedString } from '../../../utils';

/**
 * Hotspots Overlay Component
 * Displays interactive clickable areas over panel content
 */
@Component({
  selector: 'pw-hotspots-overlay',
  imports: [],
  templateUrl: './hotspots-overlay.component.html',
  styleUrls: ['./hotspots-overlay.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotspotsOverlayComponent implements OnChanges {
  /**
   * Hotspots of the current panel (manifest shape)
   */
  @Input() hotspots: Hotspot[] = [];

  /**
   * Current locale for label resolution
   */
  @Input() locale = 'en-US';

  /**
   * Container width. Pixels in panel/page view, world units in canvas view —
   * both work because the SVG viewBox scales with the element.
   */
  @Input() containerWidth = 0;

  /**
   * Container height (same unit as containerWidth)
   */
  @Input() containerHeight = 0;

  /**
   * Variable context for visibleIf evaluation (null shows all hotspots)
   */
  @Input() context: VariableContext | null = null;

  /**
   * When false the overlay is render-only: no pointer events, no tab stops
   */
  @Input() interactive = true;

  /**
   * Show the pulsing indicator animation
   */
  @Input() showIndicators = true;

  /**
   * Hotspot activated (click or keyboard). x/y are normalized 0-1
   * panel-relative coordinates of the activation point.
   */
  @Output() hotspotActivate = new EventEmitter<{ hotspot: Hotspot; x: number; y: number }>();

  /**
   * Hotspots passing their visibleIf condition
   */
  visibleHotspots: Hotspot[] = [];

  /**
   * Hotspots shown as labelled buttons: `display: "button"`, and with `auto`
   * (the default) the goTo hotspots of a panel whose hotspots lead to two or
   * more panels (a decision). `area` — and any other auto hotspot — stays an
   * invisible area over the artwork (a door, a phone, a painted button).
   */
  choiceIds: ReadonlySet<string> = new Set();

  ngOnChanges(): void {
    const ctx = this.context;
    this.visibleHotspots = (this.hotspots ?? []).filter(
      (h) => !h.visibleIf || !ctx || evaluateJsonLogic(h.visibleIf, ctx)
    );
    // Hotspot.display (schema 1.7.0): button / area as authored; auto = button for a choice.
    const goTos = (this.hotspots ?? []).filter((h) => h.action?.type === 'goTo');
    const targets = new Set(goTos.map((h) => (h.action as { to?: string }).to));
    const isChoice = new Set(targets.size > 1 ? goTos.map((h) => h.id) : []);
    this.choiceIds = new Set(
      (this.hotspots ?? [])
        .filter((h) => h.display === 'button' || ((h.display ?? 'auto') === 'auto' && isChoice.has(h.id)))
        .map((h) => h.id)
    );
  }

  /** The visible button text of a choice hotspot (its label), or '' for plain areas. */
  choiceText(h: Hotspot): string {
    return this.choiceIds.has(h.id) ? this.resolveLocalized(h.label) : '';
  }

  /** Bounding box (container units) of a hotspot shape — where its button label sits. */
  boundsOf(s: HotspotShape): { x: number; y: number; width: number; height: number } {
    switch (s.type) {
      case 'rect':
        return this.rectAttrs(s);
      case 'circle': {
        const c = this.circleAttrs(s);
        return { x: c.cx - c.r, y: c.cy - c.r, width: 2 * c.r, height: 2 * c.r };
      }
      case 'polygon': {
        const xs = s.points.map((p) => p[0] * this.containerWidth);
        const ys = s.points.map((p) => p[1] * this.containerHeight);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
      }
    }
  }

  /** Label font size: fits the button height, readable but never huge. */
  choiceFontSize(h: Hotspot): number {
    const b = this.boundsOf(h.shape);
    return Math.max(9, Math.min(18, b.height * 0.42));
  }

  /**
   * Accessible label: ariaLabel wins over label, falls back to the id
   */
  resolveLabel(h: Hotspot): string {
    return (
      this.resolveLocalized(h.ariaLabel) || this.resolveLocalized(h.label) || h.id
    );
  }

  private resolveLocalized(ls?: LocalizedString): string {
    return resolveLocalizedString(ls, this.locale, 'en-US');
  }

  /**
   * Denormalizers used by the template
   */
  rectAttrs(s: HotspotRect): { x: number; y: number; width: number; height: number } {
    return {
      x: s.x * this.containerWidth,
      y: s.y * this.containerHeight,
      width: s.w * this.containerWidth,
      height: s.h * this.containerHeight,
    };
  }

  circleAttrs(s: HotspotCircle): { cx: number; cy: number; r: number } {
    // r is normalized to the container WIDTH by convention
    return {
      cx: s.cx * this.containerWidth,
      cy: s.cy * this.containerHeight,
      r: s.r * this.containerWidth,
    };
  }

  polygonPoints(s: HotspotPolygon): string {
    return s.points
      .map(([px, py]) => `${px * this.containerWidth},${py * this.containerHeight}`)
      .join(' ');
  }

  /**
   * Pointer activation: emit the normalized click point
   */
  onShapeClick(h: Hotspot, event: MouseEvent): void {
    if (!this.interactive) return;
    event.preventDefault();
    // The upstream dead-click handler must NOT also fire for hotspot hits.
    event.stopPropagation();
    const target = event.currentTarget as SVGElement;
    const svg = target.ownerSVGElement ?? (target as unknown as SVGSVGElement);
    const r = svg.getBoundingClientRect();
    const x = r.width > 0 ? (event.clientX - r.left) / r.width : 0;
    const y = r.height > 0 ? (event.clientY - r.top) / r.height : 0;
    this.hotspotActivate.emit({ hotspot: h, x: this.clamp01(x), y: this.clamp01(y) });
  }

  /**
   * Keyboard activation: emit the shape centroid
   */
  activateByKeyboard(h: Hotspot): void {
    if (!this.interactive) return;
    const c = this.centroidOf(h.shape);
    this.hotspotActivate.emit({ hotspot: h, x: c.x, y: c.y });
  }

  onKeyDown(h: Hotspot, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      this.activateByKeyboard(h);
    }
  }

  private centroidOf(s: HotspotShape): { x: number; y: number } {
    switch (s.type) {
      case 'rect':
        return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      case 'circle':
        return { x: s.cx, y: s.cy };
      case 'polygon': {
        const n = s.points.length || 1;
        return {
          x: s.points.reduce((a, p) => a + p[0], 0) / n,
          y: s.points.reduce((a, p) => a + p[1], 0) / n,
        };
      }
    }
  }

  private clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
  }
}
