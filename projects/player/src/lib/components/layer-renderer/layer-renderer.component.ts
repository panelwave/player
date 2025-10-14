/**
 * Layer Renderer Component
 * Renders individual layers based on their type
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Layer, LocaleCode } from '../../types';

/**
 * Layer Renderer Component
 * Dynamically renders layers based on their kind
 */
@Component({
  selector: 'pw-layer-renderer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './layer-renderer.component.html',
  styleUrls: ['./layer-renderer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayerRendererComponent {
  /**
   * Layer to render
   */
  @Input() layer!: Layer;

  /**
   * Current locale for localized content
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Base URL for resolving asset paths
   */
  @Input() baseUrl = '';

  /**
   * Layer clicked
   */
  @Output() layerClick = new EventEmitter<{ layerId: string; x: number; y: number }>();

  /**
   * Get layer position and size styles
   */
  getLayerStyles(): Record<string, string> {
    const styles: Record<string, string> = {
      position: 'absolute',
    };

    // Position
    if (this.layer.x !== undefined) {
      styles['left'] = `${this.layer.x}px`;
    }
    if (this.layer.y !== undefined) {
      styles['top'] = `${this.layer.y}px`;
    }

    // Size
    if (this.layer.w !== undefined) {
      styles['width'] = `${this.layer.w}px`;
    }
    if (this.layer.h !== undefined) {
      styles['height'] = `${this.layer.h}px`;
    }

    // Z-index
    if (this.layer.z !== undefined) {
      styles['z-index'] = `${this.layer.z}`;
    }

    // Opacity
    if (this.layer.opacity !== undefined) {
      styles['opacity'] = `${this.layer.opacity}`;
    }

    return styles;
  }

  /**
   * Get transform style
   */
  getTransformStyle(): string {
    if (!this.layer.transform) {
      return '';
    }

    const t = this.layer.transform;
    const transforms: string[] = [];

    if (t.translateX || t.translateY) {
      transforms.push(`translate(${t.translateX || 0}px, ${t.translateY || 0}px)`);
    }

    if (t.rotate) {
      transforms.push(`rotate(${t.rotate}deg)`);
    }

    if (t.scaleX !== undefined || t.scaleY !== undefined) {
      const sx = t.scaleX ?? 1;
      const sy = t.scaleY ?? 1;
      transforms.push(`scale(${sx}, ${sy})`);
    }

    if (t.skewX || t.skewY) {
      transforms.push(`skew(${t.skewX || 0}deg, ${t.skewY || 0}deg)`);
    }

    return transforms.join(' ');
  }

  /**
   * Get image source URL
   */
  getImageSrc(): string {
    if (this.layer.kind !== 'image') return '';
    return this.layer.src ? `${this.baseUrl}${this.layer.src}` : '';
  }

  /**
   * Get video source URL
   */
  getVideoSrc(): string {
    if (this.layer.kind !== 'video') return '';
    return this.layer.src ? `${this.baseUrl}${this.layer.src}` : '';
  }

  /**
   * Get localized text content
   */
  getTextContent(): string {
    if (this.layer.kind !== 'text') return '';
    
    if (!this.layer.text) return '';

    // Try exact locale match
    if (typeof this.layer.text === 'object' && this.layer.text[this.locale]) {
      return this.layer.text[this.locale];
    }

    // Try base language (e.g., 'en' from 'en-US')
    const baseLocale = this.locale.split('-')[0];
    if (typeof this.layer.text === 'object') {
      const baseMatch = Object.keys(this.layer.text).find(
        (key) => key.startsWith(baseLocale)
      );
      if (baseMatch) {
        return this.layer.text[baseMatch];
      }

      // Return first available
      const firstKey = Object.keys(this.layer.text)[0];
      return this.layer.text[firstKey];
    }

    return '';
  }

  /**
   * Get text styles
   */
  getTextStyles(): Record<string, string> {
    if (this.layer.kind !== 'text') return {};

    const styles: Record<string, string> = {};

    if (this.layer.fontSize) {
      styles['font-size'] = `${this.layer.fontSize}px`;
    }

    if (this.layer.fontFamily) {
      styles['font-family'] = this.layer.fontFamily;
    }

    if (this.layer.fontWeight) {
      styles['font-weight'] = `${this.layer.fontWeight}`;
    }

    if (this.layer.color) {
      styles['color'] = this.layer.color;
    }

    if (this.layer.textAlign) {
      styles['text-align'] = this.layer.textAlign;
    }

    if (this.layer.lineHeight) {
      styles['line-height'] = `${this.layer.lineHeight}`;
    }

    return styles;
  }

  /**
   * Handle layer click
   */
  onLayerClick(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.layerClick.emit({
      layerId: this.layer.id,
      x,
      y,
    });
  }

  /**
   * Check if layer is interactive
   */
  isInteractive(): boolean {
    return this.layer.kind === 'hotspot' || this.layer.kind === 'button';
  }
}
