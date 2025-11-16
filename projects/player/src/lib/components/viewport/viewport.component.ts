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
import { LayerRendererComponent } from '../layer-renderer/layer-renderer.component';
import type { Panel, ViewMode, LocaleCode, Page, PanelPlacement, Layer, LocalizedString, AssetCatalogItem } from '../../types';
import { inject } from '@angular/core';
import { ManifestService } from '../../services/manifest.service';

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  renderTime: number;
  panelCount: number;
  visiblePanelCount: number;
  culledPanelCount: number;
  memoryUsage?: number;
  transformCalculationTime: number;
}

/**
 * Viewport Component
 * Renders a panel with pan/zoom/transform capabilities
 */
@Component({
  selector: 'pw-viewport',
  standalone: true,
  imports: [CommonModule, LayerRendererComponent],
  templateUrl: './viewport.component.html',
  styleUrls: ['./viewport.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewportComponent implements OnChanges {
  private manifestService = inject(ManifestService);

  /**
   * Panel to render (panel view)
   */
  @Input() panel: Panel | null = null;

  /**
   * Page to render (page view)
   */
  @Input() page: Page | null = null;

  /**
   * Panels map for page view lookup
   */
  @Input() panels: Record<string, Panel> = {};

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
   * Show overflow arrows
   */
  @Input() showOverflowArrows = true;

  /**
   * Enable viewport culling (hide off-screen panels)
   */
  @Input() enableViewportCulling = false;

  /**
   * Enable lazy loading for images
   */
  @Input() enableLazyLoading = true;

  /**
   * Viewport clicked
   */
  @Output() viewportClick = new EventEmitter<{ x: number; y: number }>();

  /**
   * Performance metrics event
   */
  @Output() performanceMetrics = new EventEmitter<PerformanceMetrics>();

  /**
   * Pan/zoom changed
   */
  @Output() transformChange = new EventEmitter<{ panX: number; panY: number; zoom: number }>();

  /**
   * Layer clicked
   */
  @Output() layerClick = new EventEmitter<{ layerId: string; x: number; y: number }>();

  /**
   * Swipe gesture detected
   */
  @Output() swipe = new EventEmitter<'left' | 'right' | 'up' | 'down'>();

  /**
   * Navigate to previous panel
   */
  @Output() navigatePrevious = new EventEmitter<void>();

  /**
   * Navigate to next panel
   */
  @Output() navigateNext = new EventEmitter<void>();

  /**
   * Panel focus changed
   */
  @Output() panelFocus = new EventEmitter<string | null>();

  // Focus state for navigation
  focusedPanelId: string | null = null;
  focusedPanelIndex = -1;

  // Performance tracking
  private performanceStartTime = 0;
  private renderCount = 0;
  private visiblePanels = new Set<string>();

  // Internal state - Mouse
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  lastPanX = 0;
  lastPanY = 0;

  // Navigation arrows state
  showLeftArrow = false;
  showRightArrow = false;
  private hoverZonePercent = 0.15; // 15% on each side

  // Internal state - Touch
  isTouching = false;
  touchStartX = 0;
  touchStartY = 0;
  lastTouchPanX = 0;
  lastTouchPanY = 0;
  
  // Pinch zoom state
  isPinching = false;
  initialPinchDistance = 0;
  lastPinchZoom = 1;

  // Swipe detection
  swipeStartX = 0;
  swipeStartY = 0;
  swipeStartTime = 0;
  minSwipeDistance = 50; // pixels
  maxSwipeTime = 300; // milliseconds
  minSwipeVelocity = 0.3; // pixels per millisecond

  // Overflow detection
  hasOverflowLeft = false;
  hasOverflowRight = false;
  hasOverflowTop = false;
  hasOverflowBottom = false;

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
      return 'translate(-50%, -50%) scale(1)';
    }

    // First translate centers the panel (-50%, -50%)
    // Then apply pan offsets and zoom
    return `translate(-50%, -50%) translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
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

    // Track for swipe detection
    this.swipeStartX = event.clientX;
    this.swipeStartY = event.clientY;
    this.swipeStartTime = Date.now();

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
  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    // Detect swipe before resetting drag state
    if (this.isDragging) {
      this.detectSwipe(event.clientX, event.clientY);
    }
    
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
   * Handle touch start
   */
  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      // Single touch - pan
      this.isTouching = true;
      this.isPinching = false;
      
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.lastTouchPanX = this.panX;
      this.lastTouchPanY = this.panY;
      
      // Track for swipe detection
      this.swipeStartX = touch.clientX;
      this.swipeStartY = touch.clientY;
      this.swipeStartTime = Date.now();
    } else if (event.touches.length === 2) {
      // Two touches - pinch zoom
      this.isTouching = false;
      this.isPinching = true;
      
      this.initialPinchDistance = this.getPinchDistance(event.touches);
      this.lastPinchZoom = this.zoom;
    }
  }

  /**
   * Handle touch move
   */
  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent): void {
    if (this.isTouching && event.touches.length === 1) {
      // Pan with single touch
      event.preventDefault();
      
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;

      const newPanX = this.lastTouchPanX + deltaX;
      const newPanY = this.lastTouchPanY + deltaY;

      this.transformChange.emit({
        panX: newPanX,
        panY: newPanY,
        zoom: this.zoom,
      });
    } else if (this.isPinching && event.touches.length === 2) {
      // Pinch zoom with two touches
      event.preventDefault();
      
      const currentDistance = this.getPinchDistance(event.touches);
      const scale = currentDistance / this.initialPinchDistance;
      const newZoom = Math.max(0.1, Math.min(5, this.lastPinchZoom * scale));

      this.transformChange.emit({
        panX: this.panX,
        panY: this.panY,
        zoom: newZoom,
      });
    }
  }

  /**
   * Handle touch end
   */
  @HostListener('touchend', ['$event'])
  @HostListener('touchcancel', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    // Detect swipe before resetting touch state
    if (event.changedTouches.length > 0 && this.isTouching) {
      const touch = event.changedTouches[0];
      this.detectSwipe(touch.clientX, touch.clientY);
    }

    if (event.touches.length === 0) {
      this.isTouching = false;
      this.isPinching = false;
    } else if (event.touches.length === 1 && this.isPinching) {
      // Switched from pinch to pan
      this.isPinching = false;
      this.isTouching = true;
      
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.lastTouchPanX = this.panX;
      this.lastTouchPanY = this.panY;
      
      // Reset swipe tracking
      this.swipeStartX = touch.clientX;
      this.swipeStartY = touch.clientY;
      this.swipeStartTime = Date.now();
    }
  }

  /**
   * Calculate distance between two touch points
   */
  private getPinchDistance(touches: TouchList): number {
    const touch1 = touches[0];
    const touch2 = touches[1];
    
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    
    return Math.sqrt(dx * dx + dy * dy);
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

  /**
   * Detect overflow in all directions
   */
  detectOverflow(): void {
    if (!this.panel) {
      this.hasOverflowLeft = false;
      this.hasOverflowRight = false;
      this.hasOverflowTop = false;
      this.hasOverflowBottom = false;
      return;
    }

    const panelDim = this.getPanelDimensions();
    const viewportWidth = 800; // Would get from actual viewport element
    const viewportHeight = 600;

    // Check if content can scroll in each direction
    this.hasOverflowLeft = this.panX < 0;
    this.hasOverflowRight = this.panX + panelDim.width * this.zoom > viewportWidth;
    this.hasOverflowTop = this.panY < 0;
    this.hasOverflowBottom = this.panY + panelDim.height * this.zoom > viewportHeight;
  }

  /**
   * Navigate left (show more content on the right)
   */
  navigateLeft(): void {
    const step = 200;
    this.transformChange.emit({
      panX: this.panX + step,
      panY: this.panY,
      zoom: this.zoom,
    });
  }

  /**
   * Navigate right (show more content on the left)
   */
  navigateRight(): void {
    const step = 200;
    this.transformChange.emit({
      panX: this.panX - step,
      panY: this.panY,
      zoom: this.zoom,
    });
  }

  /**
   * Navigate up (show more content below)
   */
  navigateUp(): void {
    const step = 200;
    this.transformChange.emit({
      panX: this.panX,
      panY: this.panY + step,
      zoom: this.zoom,
    });
  }

  /**
   * Navigate down (show more content above)
   */
  navigateDown(): void {
    const step = 200;
    this.transformChange.emit({
      panX: this.panX,
      panY: this.panY - step,
      zoom: this.zoom,
    });
  }

  /**
   * Get panels sorted by z-index (lowest to highest for rendering order)
   */
  getSortedPanels(): PanelPlacement[] {
    if (!this.page?.layout.placements) return [];
    
    return [...this.page.layout.placements].sort((a, b) => {
      const zA = a.z ?? 0;
      const zB = b.z ?? 0;
      return zA - zB;
    });
  }

  /**
   * Convert normalized value (0-1) to percentage
   */
  toPercent(value: number): number {
    return value * 100;
  }

  /**
   * Get CSS transform for panel (rotation)
   */
  getPanelTransform(placement: PanelPlacement): string {
    if (!placement.r || placement.r === 0) {
      return 'none';
    }
    return `rotate(${placement.r}deg)`;
  }

  /**
   * Get transform origin CSS for panel
   */
  getTransformOrigin(placement: PanelPlacement): string {
    if (!placement.origin) {
      return 'center center'; // Default
    }
    
    const x = placement.origin.x * 100;
    const y = placement.origin.y * 100;
    return `${x}% ${y}%`;
  }

  /**
   * Get clip-path CSS for panel content (visible area)
   * Returns inset values to show only the visible portion of the panel
   */
  getPanelContentClipPath(placement: PanelPlacement): string {
    const vx = placement.vx ?? 0;
    const vy = placement.vy ?? 0;
    const vw = placement.vw ?? 1;
    const vh = placement.vh ?? 1;
    
    // If full panel is visible, no clipping needed
    if (vx === 0 && vy === 0 && vw === 1 && vh === 1) {
      return 'none';
    }
    
    // Calculate inset values as percentages
    // inset(top right bottom left)
    const top = vy * 100;
    const right = (1 - (vx + vw)) * 100;
    const bottom = (1 - (vy + vh)) * 100;
    const left = vx * 100;
    
    return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  }

  /**
   * Get position offset for panel content (visible area)
   * Returns translate transform to shift content when visible area is cropped
   */
  getPanelContentTransform(placement: PanelPlacement): string {
    const vx = placement.vx ?? 0;
    const vy = placement.vy ?? 0;
    
    // If no offset, return none
    if (vx === 0 && vy === 0) {
      return 'none';
    }
    
    // Translate content by negative offset to show the visible portion
    const translateX = -vx * 100;
    const translateY = -vy * 100;
    
    return `translate(${translateX}%, ${translateY}%)`;
  }

  /**
   * Handle panel click in page view
   */
  onPanelClick(event: MouseEvent, panelId: string): void {
    event.stopPropagation();
    
    // Get click coordinates relative to panel
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Emit viewport click with panel context
    this.viewportClick.emit({ x, y });
    
    console.log(`Panel clicked: ${panelId} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
  }

  /**
   * Check if point is inside a rotated panel
   * Used for precise hit testing when panels have rotation
   */
  isPointInRotatedPanel(
    point: { x: number; y: number },
    placement: PanelPlacement,
    canvasWidth: number,
    canvasHeight: number
  ): boolean {
    // Convert normalized placement to pixel coordinates
    const panelX = placement.x * canvasWidth;
    const panelY = placement.y * canvasHeight;
    const panelWidth = placement.w * canvasWidth;
    const panelHeight = placement.h * canvasHeight;

    // If no rotation, simple bounding box check
    if (!placement.r || placement.r === 0) {
      return (
        point.x >= panelX &&
        point.x <= panelX + panelWidth &&
        point.y >= panelY &&
        point.y <= panelY + panelHeight
      );
    }

    // For rotated panels, transform point to panel's local space
    const origin = placement.origin || { x: 0.5, y: 0.5 };
    const originX = panelX + panelWidth * origin.x;
    const originY = panelY + panelHeight * origin.y;

    // Translate point to origin
    const translatedX = point.x - originX;
    const translatedY = point.y - originY;

    // Rotate point by negative rotation angle (inverse rotation)
    const angleRad = (-placement.r * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;

    // Translate back and check if in axis-aligned bounding box
    const localX = rotatedX + panelWidth * origin.x;
    const localY = rotatedY + panelHeight * origin.y;

    return (
      localX >= 0 &&
      localX <= panelWidth &&
      localY >= 0 &&
      localY <= panelHeight
    );
  }

  /**
   * Get the panel at a specific point, considering rotation and z-index
   * Returns the top-most panel (highest z-index) at the given point
   */
  getPanelAtPoint(point: { x: number; y: number }): PanelPlacement | null {
    if (!this.page?.layout.placements) return null;

    const canvas = document.querySelector('.page-canvas') as HTMLElement;
    if (!canvas) return null;

    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    // Check from highest z-index to lowest (reverse of render order)
    const sortedPanels = this.getSortedPanels().reverse();

    for (const placement of sortedPanels) {
      if (this.isPointInRotatedPanel(point, placement, canvasWidth, canvasHeight)) {
        return placement;
      }
    }

    return null;
  }

  /**
   * Get panel by ID from panels map
   */
  getPanel(panelId: string): Panel | undefined {
    if (!this.panels || !this.panels[panelId]) {
      console.warn(`Panel not found: ${panelId}`);
      return undefined;
    }
    return this.panels[panelId];
  }

  /**
   * Get alt text for a layer from the asset catalog
   */
  getAltText(layer: Layer): string {
    if (!layer.assetId) return '';
    
    // Get manifest and asset catalog
    const manifest = this.manifestService.getManifest();
    if (!manifest?.assets?.catalog) return '';
    
    // Find asset by ID
    const asset = manifest.assets.catalog.find((a: AssetCatalogItem) => a.id === layer.assetId);
    if (!asset?.alt) return '';
    
    // Get localized alt text
    return this.getLocalizedString(asset.alt);
  }

  /**
   * Get localized string based on current locale
   */
  private getLocalizedString(text: LocalizedString): string {
    if (!text || typeof text !== 'object') return '';
    
    // Try exact locale match
    if (text[this.locale]) return text[this.locale];
    
    // Try base language (e.g., en-US -> en)
    const baseLocale = this.locale.split('-')[0];
    const baseMatch = Object.keys(text).find(key => key.startsWith(baseLocale));
    if (baseMatch && text[baseMatch]) return text[baseMatch];
    
    // Fallback to first available
    const firstKey = Object.keys(text)[0];
    return firstKey ? text[firstKey] : '';
  }

  /**
   * Detect swipe gesture
   */
  private detectSwipe(endX: number, endY: number): void {
    const deltaX = endX - this.swipeStartX;
    const deltaY = endY - this.swipeStartY;
    const deltaTime = Date.now() - this.swipeStartTime;
    
    // Calculate distance and velocity
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = distance / deltaTime; // pixels per millisecond
    
    // Check if it's a valid swipe (fast enough and far enough)
    if (deltaTime > this.maxSwipeTime || distance < this.minSwipeDistance) {
      return; // Not a swipe, just a slow drag
    }
    
    if (velocity < this.minSwipeVelocity) {
      return; // Too slow to be considered a swipe
    }
    
    // Determine swipe direction (prioritize horizontal or vertical)
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    if (absDeltaX > absDeltaY) {
      // Horizontal swipe
      if (deltaX > 0) {
        this.swipe.emit('right');
      } else {
        this.swipe.emit('left');
      }
    } else {
      // Vertical swipe
      if (deltaY > 0) {
        this.swipe.emit('down');
      } else {
        this.swipe.emit('up');
      }
    }
  }

  /**
   * Handle viewport mouse move for navigation arrows
   */
  onViewportMouseMove(event: MouseEvent): void {
    // Only show arrows in panel view
    if (this.viewMode !== 'panel') {
      this.showLeftArrow = false;
      this.showRightArrow = false;
      return;
    }

    const target = event.currentTarget as HTMLElement;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;

    const leftZoneWidth = width * this.hoverZonePercent;
    const rightZoneStart = width - (width * this.hoverZonePercent);

    this.showLeftArrow = x <= leftZoneWidth;
    this.showRightArrow = x >= rightZoneStart;
  }

  /**
   * Handle viewport mouse leave - hide arrows
   */
  onViewportMouseLeave(): void {
    this.showLeftArrow = false;
    this.showRightArrow = false;
  }

  /**
   * Navigate to previous panel
   */
  onNavigatePrevious(): void {
    this.navigatePrevious.emit();
  }

  /**
   * Navigate to next panel
   */
  onNavigateNext(): void {
    this.navigateNext.emit();
  }

  /**
   * Set focus on a specific panel
   */
  focusPanel(panelId: string | null): void {
    this.focusedPanelId = panelId;
    
    if (panelId && this.page?.readingOrder) {
      this.focusedPanelIndex = this.page.readingOrder.indexOf(panelId);
    } else {
      this.focusedPanelIndex = -1;
    }
    
    this.panelFocus.emit(panelId);
  }

  /**
   * Handle keyboard navigation (Tab key)
   */
  @HostListener('keydown.tab', ['$event'])
  onKeydownTab(event: KeyboardEvent): void {
    if (this.viewMode !== 'page' || !this.page?.readingOrder) return;
    
    event.preventDefault();
    
    const readingOrder = this.page.readingOrder;
    const currentIndex = this.focusedPanelIndex;
    
    if (event.shiftKey) {
      // Navigate backwards (Shift+Tab)
      const newIndex = currentIndex <= 0 ? readingOrder.length - 1 : currentIndex - 1;
      this.focusPanel(readingOrder[newIndex]);
    } else {
      // Navigate forwards (Tab)
      const newIndex = currentIndex >= readingOrder.length - 1 ? 0 : currentIndex + 1;
      this.focusPanel(readingOrder[newIndex]);
    }
  }

  /**
   * Handle arrow key navigation
   */
  @HostListener('keydown.arrowRight', ['$event'])
  @HostListener('keydown.arrowDown', ['$event'])
  onKeydownNext(event: KeyboardEvent): void {
    if (this.viewMode !== 'page' || !this.page?.readingOrder) return;
    
    event.preventDefault();
    
    const readingOrder = this.page.readingOrder;
    const currentIndex = this.focusedPanelIndex;
    const newIndex = currentIndex >= readingOrder.length - 1 ? 0 : currentIndex + 1;
    
    this.focusPanel(readingOrder[newIndex]);
  }

  @HostListener('keydown.arrowLeft', ['$event'])
  @HostListener('keydown.arrowUp', ['$event'])
  onKeydownPrevious(event: KeyboardEvent): void {
    if (this.viewMode !== 'page' || !this.page?.readingOrder) return;
    
    event.preventDefault();
    
    const readingOrder = this.page.readingOrder;
    const currentIndex = this.focusedPanelIndex;
    const newIndex = currentIndex <= 0 ? readingOrder.length - 1 : currentIndex - 1;
    
    this.focusPanel(readingOrder[newIndex]);
  }

  /**
   * Handle panel click with overlap handling
   * Enhanced to set focus on clicked panel
   */
  onPanelClickWithFocus(event: MouseEvent): void {
    if (this.viewMode !== 'page') return;
    
    const canvas = event.currentTarget as HTMLElement;
    if (!canvas) return;
    
    // Determine which panel was clicked
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    
    // Find the top-most panel at click position
    const clickedPanel = this.getPanelAtPoint(point);
    
    if (clickedPanel) {
      this.focusPanel(clickedPanel.panelId);
      console.log(`Panel focused: ${clickedPanel.panelId} (z-index: ${clickedPanel.z || 0})`);
    } else {
      // Clicked on empty space - clear focus
      this.focusPanel(null);
    }
  }

  /**
   * Handle keyboard activation of canvas (Enter/Space)
   * Focuses on the first panel in reading order if nothing is focused
   */
  onCanvasKeyboardActivate(event: Event): void {
    if (this.viewMode !== 'page') return;
    
    event.preventDefault();
    
    // If nothing is focused, focus on the first panel in reading order
    if (!this.focusedPanelId && this.page?.readingOrder && this.page.readingOrder.length > 0) {
      this.focusPanel(this.page.readingOrder[0]);
    }
  }

  /**
   * Get focus rect for a panel (accounting for rotation)
   * Returns the bounding box coordinates for focus visualization
   */
  getFocusRect(placement: PanelPlacement): {
    left: number;
    top: number;
    width: number;
    height: number;
    rotation: number;
  } | null {
    const canvas = document.querySelector('.page-canvas') as HTMLElement;
    if (!canvas) return null;
    
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    
    // Convert normalized to pixel coordinates
    const left = placement.x * canvasWidth;
    const top = placement.y * canvasHeight;
    const width = placement.w * canvasWidth;
    const height = placement.h * canvasHeight;
    
    return {
      left,
      top,
      width,
      height,
      rotation: placement.r || 0
    };
  }

  /**
   * Check if a panel is currently focused
   */
  isPanelFocused(panelId: string): boolean {
    return this.focusedPanelId === panelId;
  }

  /**
   * Check if a panel is visible in viewport (for culling)
   */
  isPanelVisible(placement: PanelPlacement): boolean {
    if (!this.enableViewportCulling) {
      return true; // Always visible if culling disabled
    }

    const canvas = document.querySelector('.page-canvas') as HTMLElement;
    if (!canvas) return true;
    
    // Convert normalized to pixel coordinates
    const panelLeft = placement.x * canvas.offsetWidth;
    const panelTop = placement.y * canvas.offsetHeight;
    const panelWidth = placement.w * canvas.offsetWidth;
    const panelHeight = placement.h * canvas.offsetHeight;

    // Simple bounding box check (could be enhanced for rotation)
    const panelRight = panelLeft + panelWidth;
    const panelBottom = panelTop + panelHeight;

    // Check if panel intersects viewport
    const isVisible = !(
      panelRight < 0 ||
      panelBottom < 0 ||
      panelLeft > canvas.offsetWidth ||
      panelTop > canvas.offsetHeight
    );

    // Track visible panels
    if (isVisible) {
      this.visiblePanels.add(placement.panelId);
    } else {
      this.visiblePanels.delete(placement.panelId);
    }

    return isVisible;
  }

  /**
   * Start performance measurement
   */
  startPerformanceMeasurement(): void {
    this.performanceStartTime = performance.now();
  }

  /**
   * End performance measurement and emit metrics
   */
  endPerformanceMeasurement(): void {
    if (this.performanceStartTime === 0) return;

    const renderTime = performance.now() - this.performanceStartTime;
    const panelCount = this.page?.layout.placements.length || 0;
    const visiblePanelCount = this.visiblePanels.size;
    const culledPanelCount = panelCount - visiblePanelCount;

    // Calculate memory usage if available
    let memoryUsage: number | undefined;
    if ('memory' in performance) {
      const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (perfMemory) {
        memoryUsage = perfMemory.usedJSHeapSize / 1024 / 1024; // MB
      }
    }

    const metrics: PerformanceMetrics = {
      renderTime,
      panelCount,
      visiblePanelCount,
      culledPanelCount,
      memoryUsage,
      transformCalculationTime: 0 // Updated separately if needed
    };

    this.performanceMetrics.emit(metrics);
    this.renderCount++;
  }

  /**
   * Get lazy loading state for images
   * Returns 'lazy' if lazy loading is enabled, 'eager' otherwise
   */
  getImageLoadingStrategy(): 'lazy' | 'eager' {
    return this.enableLazyLoading ? 'lazy' : 'eager';
  }

  /**
   * Measure transform calculation performance
   */
  measureTransformPerformance(callback: () => void): number {
    const start = performance.now();
    callback();
    const end = performance.now();
    return end - start;
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    totalRenders: number;
    averageRenderTime: number;
    visiblePanelCount: number;
    memoryUsage?: number;
  } {
    let memoryUsage: number | undefined;
    if ('memory' in performance) {
      const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (perfMemory) {
        memoryUsage = perfMemory.usedJSHeapSize / 1024 / 1024; // MB
      }
    }

    return {
      totalRenders: this.renderCount,
      averageRenderTime: 0, // Would need to track average over time
      visiblePanelCount: this.visiblePanels.size,
      memoryUsage
    };
  }

  /**
   * Force garbage collection (if available)
   * Note: This is only available in dev mode or with specific flags
   */
  forceGarbageCollection(): void {
    const globalWithGC = global as unknown as { gc?: () => void };
    if ('gc' in global && typeof globalWithGC.gc === 'function') {
      globalWithGC.gc();
      console.log('[Performance] Garbage collection triggered');
    } else {
      console.warn('[Performance] Garbage collection not available');
    }
  }

  /**
   * Profile memory usage
   */
  profileMemory(): {
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  } {
    if ('memory' in performance) {
      const perfMemory = (performance as unknown as { 
        memory?: { 
          totalJSHeapSize: number; 
          usedJSHeapSize: number; 
          jsHeapSizeLimit: number 
        } 
      }).memory;
      
      if (perfMemory) {
        return {
          totalJSHeapSize: perfMemory.totalJSHeapSize / 1024 / 1024, // MB
          usedJSHeapSize: perfMemory.usedJSHeapSize / 1024 / 1024, // MB
          jsHeapSizeLimit: perfMemory.jsHeapSizeLimit / 1024 / 1024 // MB
        };
      }
    }
    return {};
  }

  /**
   * Log performance metrics to console
   */
  logPerformanceMetrics(): void {
    const stats = this.getPerformanceStats();
    const memory = this.profileMemory();

    console.group('[Performance Metrics]');
    console.log('Total Renders:', stats.totalRenders);
    console.log('Visible Panels:', stats.visiblePanelCount);
    if (stats.memoryUsage) {
      console.log('Memory Usage:', stats.memoryUsage.toFixed(2), 'MB');
    }
    if (memory.usedJSHeapSize) {
      console.log('Heap Used:', memory.usedJSHeapSize.toFixed(2), 'MB');
      console.log('Heap Total:', memory.totalJSHeapSize?.toFixed(2), 'MB');
      console.log('Heap Limit:', memory.jsHeapSizeLimit?.toFixed(2), 'MB');
    }
    console.groupEnd();
  }
}
