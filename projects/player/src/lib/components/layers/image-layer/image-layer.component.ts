/**
 * Image Layer Component
 * Renders image layers with loading states and error handling
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';

import { PwIconComponent } from '../../icon/pw-icon.component';


/**
 * Image Layer Component
 * Displays images with lazy loading and error fallback
 */
@Component({
    selector: 'pw-image-layer',
    imports: [PwIconComponent],
    templateUrl: './image-layer.component.html',
    styleUrls: ['./image-layer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageLayerComponent {
  /**
   * Image source URL
   */
  @Input() src = '';

  /**
   * Alt text for accessibility
   */
  @Input() alt = '';

  /**
   * Base URL for resolving relative paths
   */
  @Input() baseUrl = '';

  /**
   * Enable lazy loading
   */
  @Input() lazy = true;

  /**
   * Object fit mode
   */
  @Input() objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down' = 'contain';

  /**
   * Image loaded successfully
   */
  @Output() imageLoad = new EventEmitter<void>();

  /**
   * Image failed to load
   */
  @Output() imageError = new EventEmitter<ErrorEvent>();

  // Internal state
  loading = true;
  error = false;

  /**
   * Get full image URL
   */
  getImageUrl(): string {
    if (!this.src) return '';
    
    // If already absolute URL, return as-is
    if (this.src.startsWith('http://') || this.src.startsWith('https://') || this.src.startsWith('data:')) {
      return this.src;
    }
    
    // Otherwise prepend base URL
    return this.baseUrl + this.src;
  }

  /**
   * Handle image load success
   */
  onLoad(): void {
    this.loading = false;
    this.error = false;
    this.imageLoad.emit();
  }

  /**
   * Handle image load error
   */
  onError(event: Event): void {
    this.loading = false;
    this.error = true;
    this.imageError.emit(event as ErrorEvent);
  }

  /**
   * Get object fit style
   */
  getObjectFitStyle(): string {
    return this.objectFit;
  }
}
