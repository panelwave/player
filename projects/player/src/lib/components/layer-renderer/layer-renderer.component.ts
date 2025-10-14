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

    const layer = this.layer as Record<string, unknown>;

    // Position
    if (layer['x'] !== undefined) {
      styles['left'] = `${layer['x']}px`;
    }
    if (layer['y'] !== undefined) {
      styles['top'] = `${layer['y']}px`;
    }

    // Size
    if (layer['w'] !== undefined) {
      styles['width'] = `${layer['w']}px`;
    }
    if (layer['h'] !== undefined) {
      styles['height'] = `${layer['h']}px`;
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

    const t = this.layer.transform as Record<string, unknown>;
    const transforms: string[] = [];

    if (t['translateX'] || t['translateY']) {
      transforms.push(`translate(${t['translateX'] || 0}px, ${t['translateY'] || 0}px)`);
    }

    if (t['rotate']) {
      transforms.push(`rotate(${t['rotate']}deg)`);
    }

    if (t['scale']) {
      transforms.push(`scale(${t['scale']})`);
    }

    return transforms.join(' ');
  }

  /**
   * Get image source URL
   */
  getImageSrc(): string {
    if (this.layer.kind !== 'image') return '';
    const src = (this.layer as Record<string, unknown>)['src'];
    return src ? `${this.baseUrl}${src}` : '';
  }

  /**
   * Get video source URL
   */
  getVideoSrc(): string {
    if (this.layer.kind !== 'video') return '';
    const src = (this.layer as Record<string, unknown>)['src'];
    return src ? `${this.baseUrl}${src}` : '';
  }

  /**
   * Get localized text content
   */
  getTextContent(): string {
    if (this.layer.kind !== 'text') return '';
    
    const text = (this.layer as Record<string, unknown>)['text'];
    if (!text || typeof text !== 'object') return '';

    const textObj = text as Record<string, string>;

    // Try exact locale match
    if (textObj[this.locale]) {
      return textObj[this.locale];
    }

    // Try base language (e.g., 'en' from 'en-US')
    const baseLocale = this.locale.split('-')[0];
    const baseMatch = Object.keys(textObj).find(
      (key) => key.startsWith(baseLocale)
    );
    if (baseMatch) {
      return textObj[baseMatch];
    }

    // Return first available
    const firstKey = Object.keys(textObj)[0];
    return firstKey ? textObj[firstKey] : '';
  }

  /**
   * Get text styles
   */
  getTextStyles(): Record<string, string> {
    if (this.layer.kind !== 'text') return {};

    const styles: Record<string, string> = {};
    const layer = this.layer as Record<string, unknown>;

    if (layer['fontSize']) {
      styles['font-size'] = `${layer['fontSize']}px`;
    }

    if (layer['fontFamily']) {
      styles['font-family'] = layer['fontFamily'] as string;
    }

    if (layer['fontWeight']) {
      styles['font-weight'] = `${layer['fontWeight']}`;
    }

    if (layer['color']) {
      styles['color'] = layer['color'] as string;
    }

    if (layer['textAlign']) {
      styles['text-align'] = layer['textAlign'] as string;
    }

    if (layer['lineHeight']) {
      styles['line-height'] = `${layer['lineHeight']}`;
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
    // Note: 'hotspot' and 'button' are not in the current LayerKind type
    // This method is kept for future compatibility
    const kind = this.layer.kind as string;
    return kind === 'hotspot' || kind === 'button';
  }
}
