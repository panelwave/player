/**
 * Viewport Component
 * Main rendering container for panels with pan/zoom support
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Panel, ViewMode, LocaleCode } from '../../types';

/**
 * Viewport Component
 * Renders a panel with pan/zoom/transform capabilities
 */
@Component({
  selector: 'pw-viewport',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './viewport.component.html',
  styleUrls: ['./viewport.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewportComponent implements OnChanges {
  /**
   * Panel to render
   */
  @Input() panel: Panel | null = null;

  /**
   * View mode (panel or page)
   */
  @Input() viewMode: ViewMode = 'panel';

  /**
   * Current locale for localized content
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Pan X offset (pixels)
   */
  @Input() panX = 0;

  /**
   * Pan Y offset (pixels)
   */
  @Input() panY = 0;

  /**
   * Zoom level (1.0 = 100%)
   */
  @Input() zoom = 1;

  /**
   * Enable reduced motion
   */
  @Input() reducedMotion = false;

  /**
   * Enable interactive mode (hotspots, etc.)
   */
  @Input() interactive = true;

  /**
   * Viewport clicked
   */
  @Output() viewportClick = new EventEmitter<{ x: number; y: number }>();

  /**
   * Pan/zoom changed
   */
  @Output() transformChange = new EventEmitter<{ panX: number; panY: number; zoom: number }>();

  /**
   * Layer clicked
   */
  @Output() layerClick = new EventEmitter<{ layerId: string; x: number; y: number }>();

  // Internal state
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  lastPanX = 0;
  lastPanY = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['panel']) {
      // Reset pan/zoom when panel changes
      if (changes['panel'].currentValue !== changes['panel'].previousValue) {
        this.resetTransform();
      }
    }
  }

  /**
   * Get transform style for viewport
   */
  getTransformStyle(): string {
    if (this.reducedMotion) {
      // No transform in reduced motion mode
      return 'translate(0, 0) scale(1)';
    }

    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  /**
   * Get CSS class for view mode
   */
  getViewModeClass(): string {
    return `viewport-${this.viewMode}`;
  }

  /**
   * Handle viewport click
   */
  onViewportClick(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.viewportClick.emit({ x, y });
  }

  /**
   * Handle keyboard activation
   */
  onKeyboardActivate(event: Event): void {
    event.preventDefault();
    // Emit click at center of viewport
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.width / 2;
    const y = rect.height / 2;

    this.viewportClick.emit({ x, y });
  }

  /**
   * Handle mouse down for pan
   */
  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Left button only

    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.lastPanX = this.panX;
    this.lastPanY = this.panY;

    event.preventDefault();
  }

  /**
   * Handle mouse move for pan
   */
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    const newPanX = this.lastPanX + deltaX;
    const newPanY = this.lastPanY + deltaY;

    this.transformChange.emit({
      panX: newPanX,
      panY: newPanY,
      zoom: this.zoom,
    });
  }

  /**
   * Handle mouse up for pan
   */
  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isDragging = false;
  }

  /**
   * Handle mouse wheel for zoom
   */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return; // Zoom only with Ctrl/Cmd

    event.preventDefault();

    const delta = -event.deltaY;
    const zoomFactor = 0.001;
    const newZoom = Math.max(0.1, Math.min(5, this.zoom + delta * zoomFactor));

    this.transformChange.emit({
      panX: this.panX,
      panY: this.panY,
      zoom: newZoom,
    });
  }

  /**
   * Reset transform to default
   */
  resetTransform(): void {
    this.transformChange.emit({
      panX: 0,
      panY: 0,
      zoom: 1,
    });
  }

  /**
   * Fit panel to viewport
   */
  fitToViewport(): void {
    if (!this.panel) return;

    // Calculate zoom to fit
    // This would need viewport dimensions - simplified for now
    this.transformChange.emit({
      panX: 0,
      panY: 0,
      zoom: 1,
    });
  }

  /**
   * Get panel dimensions
   */
  getPanelDimensions(): { width: number; height: number } {
    if (!this.panel) {
      return { width: 0, height: 0 };
    }

    // Calculate from layers - simplified
    return { width: 800, height: 600 };
  }
}
