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
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  Layer,
  LocaleCode,
  VideoLayer,
  VideoPlayMode,
  VideoStartMode,
  AssetCatalogItemVideo,
} from '../../types';
import { ManifestService } from '../../services/manifest.service';
import { VideoLayerComponent, type LayerViewMode } from '../layers/video-layer/video-layer.component';
import {
  resolvePlayMode,
  resolveStartMode,
  resolveMuted,
} from '../../utils/video-config-utils';

/**
 * Layer Renderer Component
 * Dynamically renders layers based on their kind
 */
@Component({
    selector: 'pw-layer-renderer',
    imports: [CommonModule, VideoLayerComponent],
    templateUrl: './layer-renderer.component.html',
    styleUrls: ['./layer-renderer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayerRendererComponent {
  private manifestService = inject(ManifestService);

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
   * Alt text for image layers (localized)
   */
  @Input() altText = '';

  /**
   * View mode of the surrounding viewport (`on-hover` only applies to page view).
   */
  @Input() viewMode: LayerViewMode = 'panel';

  /**
   * Whether the owning panel is currently visible / current. Drives `on-view`
   * playback for video layers (sequencer surface).
   */
  @Input() viewActive = false;

  /**
   * Reduced-motion preference (degrades video `on-view` to `on-click`).
   */
  @Input() reducedMotion = false;

  /**
   * Base URL used for resolving video/reverse variant paths.
   */
  @Input() videoBaseUrl = '';

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
    } else {
      styles['left'] = '0';
    }
    
    if (layer['y'] !== undefined) {
      styles['top'] = `${layer['y']}px`;
    } else {
      styles['top'] = '0';
    }

    // Size
    if (layer['w'] !== undefined) {
      styles['width'] = `${layer['w']}px`;
    } else {
      styles['width'] = '100%';
    }
    
    if (layer['h'] !== undefined) {
      styles['height'] = `${layer['h']}px`;
    } else {
      styles['height'] = '100%';
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
    
    // Try to get assetId first (from manifest reference)
    const assetId = (this.layer as Record<string, unknown>)['assetId'];
    if (assetId && typeof assetId === 'string') {
      const asset = this.manifestService.getAsset(assetId);
      if (asset && asset.variants && asset.variants.length > 0) {
        return asset.variants[0].src;
      }
    }
    
    // Fall back to direct src if provided
    const src = (this.layer as Record<string, unknown>)['src'];
    return src ? `${this.baseUrl}${src}` : '';
  }

  /**
   * Get the video catalog item for the current layer (if any).
   */
  private getVideoAsset(): AssetCatalogItemVideo | null {
    if (this.layer.kind !== 'video') return null;
    const assetId = (this.layer as Record<string, unknown>)['assetId'];
    if (assetId && typeof assetId === 'string') {
      const asset = this.manifestService.getAsset(assetId);
      if (asset && (asset as AssetCatalogItemVideo).category === 'video') {
        return asset as AssetCatalogItemVideo;
      }
    }
    return null;
  }

  /**
   * Get the forward (default) video source URL.
   */
  getVideoSrc(): string {
    if (this.layer.kind !== 'video') return '';

    const asset = this.getVideoAsset();
    if (asset && asset.variants && asset.variants.length > 0) {
      // Prefer a forward (non-reverse) variant.
      const forward =
        asset.variants.find((v) => v.direction !== 'reverse') ?? asset.variants[0];
      return forward.src;
    }

    // Fall back to direct src if provided
    const src = (this.layer as Record<string, unknown>)['src'];
    return src ? `${this.baseUrl}${src}` : '';
  }

  /**
   * Get the reverse-variant URL for pingpong (empty string if none).
   */
  getVideoReverseSrc(): string {
    const asset = this.getVideoAsset();
    const reverse = asset?.variants?.find((v) => v.direction === 'reverse');
    return reverse ? reverse.src : '';
  }

  /**
   * Get the poster URL for the video (empty string if none). Sourced from
   * the catalog asset's `poster.src` (schema 1.1+); resolved against
   * `videoBaseUrl` downstream by `pw-video-layer`, same as `getVideoSrc()`.
   */
  getVideoPoster(): string {
    const asset = this.getVideoAsset();
    return asset?.poster?.src ?? '';
  }

  /**
   * Whether the active (forward) video variant is streaming/HLS.
   */
  getVideoStreaming(): boolean {
    const asset = this.getVideoAsset();
    const forward =
      asset?.variants?.find((v) => v.direction !== 'reverse') ?? asset?.variants?.[0];
    return forward?.streaming === true;
  }

  /**
   * Effective video play mode (layer → settings.ui default → built-in).
   */
  getVideoPlayMode(): VideoPlayMode {
    return resolvePlayMode(this.layer as Partial<VideoLayer>, this.uiDefaults());
  }

  /**
   * Effective video start mode (layer → settings.ui default → built-in).
   */
  getVideoStartMode(): VideoStartMode {
    return resolveStartMode(this.layer as Partial<VideoLayer>, this.uiDefaults());
  }

  /**
   * Effective video muted state (layer → settings.ui default → built-in true).
   */
  getVideoMuted(): boolean {
    return resolveMuted(this.layer as Partial<VideoLayer>, this.uiDefaults());
  }

  /**
   * Effective startAtMs offset.
   */
  getVideoStartAtMs(): number {
    const value = (this.layer as Record<string, unknown>)['startAtMs'];
    return typeof value === 'number' ? value : 0;
  }

  /**
   * loopFromMs (only meaningful for playMode 'loop-from').
   */
  getVideoLoopFromMs(): number | undefined {
    const value = (this.layer as Record<string, unknown>)['loopFromMs'];
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Work-level UI defaults from the loaded manifest, if any.
   */
  private uiDefaults() {
    return this.manifestService.getManifest()?.settings?.ui;
  }

  /**
   * Get image alt text
   */
  getAltText(): string {
    // Use provided altText input first, then check layer property
    if (this.altText) {
      return this.altText;
    }
    const alt = (this.layer as Record<string, unknown>)['alt'];
    return alt ? String(alt) : '';
  }

  /**
   * Get video controls setting (defaults to false; native controls hidden
   * unless the layer explicitly enables them).
   */
  getVideoControls(): boolean {
    const controls = (this.layer as Record<string, unknown>)['controls'];
    return controls === true;
  }

  /**
   * Get SVG content
   */
  getSvgContent(): string {
    const svg = (this.layer as Record<string, unknown>)['svg'];
    return svg ? String(svg) : '';
  }

  /**
   * Get shape type
   */
  getShapeType(): string {
    const shape = (this.layer as Record<string, unknown>)['shape'];
    return shape ? String(shape) : '';
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
