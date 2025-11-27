/**
 * Hotspots Overlay Component
 * Renders interactive hotspot shapes on top of panels
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';


/**
 * Hotspot shape definition
 */
export interface Hotspot {
  id: string;
  shape: 'rect' | 'circle' | 'polygon';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Hotspots Overlay Component
 * Displays interactive clickable areas over panel content
 */
@Component({
    selector: 'pw-hotspots-overlay',
    imports: [],
    templateUrl: './hotspots-overlay.component.html',
    styleUrls: ['./hotspots-overlay.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HotspotsOverlayComponent {
  /**
   * Array of hotspots to render
   */
  @Input() hotspots: Hotspot[] = [];

  /**
   * Show visual indicators
   */
  @Input() showIndicators = true;

  /**
   * Highlight on hover
   */
  @Input() highlightOnHover = true;

  /**
   * Hotspot clicked
   */
  @Output() hotspotClick = new EventEmitter<{ hotspot: Hotspot; event: MouseEvent }>();

  /**
   * Hotspot activated via keyboard
   */
  @Output() hotspotActivate = new EventEmitter<Hotspot>();

  /**
   * Hotspot focused
   */
  @Output() hotspotFocus = new EventEmitter<Hotspot>();

  /**
   * Currently focused hotspot index
   */
  focusedIndex = -1;

  /**
   * Handle hotspot click
   */
  onHotspotClick(hotspot: Hotspot, event: MouseEvent): void {
    if (hotspot.disabled) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    this.hotspotClick.emit({ hotspot, event });
  }

  /**
   * Handle keyboard activation
   */
  onKeyDown(hotspot: Hotspot, event: KeyboardEvent): void {
    if (hotspot.disabled) return;
    
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      this.hotspotActivate.emit(hotspot);
    }
  }

  /**
   * Handle focus
   */
  onFocus(hotspot: Hotspot, index: number): void {
    this.focusedIndex = index;
    this.hotspotFocus.emit(hotspot);
  }

  /**
   * Handle blur
   */
  onBlur(): void {
    this.focusedIndex = -1;
  }

  /**
   * Get SVG rect attributes
   */
  getRectAttributes(hotspot: Hotspot): Record<string, string | number> {
    return {
      x: hotspot.x || 0,
      y: hotspot.y || 0,
      width: hotspot.width || 100,
      height: hotspot.height || 100,
    };
  }

  /**
   * Get SVG circle attributes
   */
  getCircleAttributes(hotspot: Hotspot): Record<string, string | number> {
    return {
      cx: (hotspot.x || 0) + (hotspot.radius || 50),
      cy: (hotspot.y || 0) + (hotspot.radius || 50),
      r: hotspot.radius || 50,
    };
  }

  /**
   * Get SVG polygon points
   */
  getPolygonPoints(hotspot: Hotspot): string {
    return hotspot.points || '0,0 100,0 100,100 0,100';
  }

  /**
   * Check if hotspot is focused
   */
  isFocused(index: number): boolean {
    return this.focusedIndex === index;
  }

  /**
   * Get ARIA label for hotspot
   */
  getAriaLabel(hotspot: Hotspot): string {
    if (hotspot.label) {
      return hotspot.label;
    }
    return `Interactive hotspot ${hotspot.id}`;
  }
}
