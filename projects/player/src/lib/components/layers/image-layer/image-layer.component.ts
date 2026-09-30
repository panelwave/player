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
  inject,
} from '@angular/core';
import { AssetUrlService } from '../../../services/asset-url.service';

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

  private readonly assetUrl = inject(AssetUrlService);

  /**
   * Full image URL: absolute src as-is, relative src resolved against the
   * manifest's assets.base / manifest URL (AssetUrlService).
   */
  getImageUrl(): string {
    return this.assetUrl.resolve(this.src, 'image');
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
