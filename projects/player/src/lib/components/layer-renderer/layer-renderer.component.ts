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
  VideoVariant,
  ImageVariant,
} from '../../types';
import { ManifestService } from '../../services/manifest.service';
import { VideoLayerComponent, type LayerViewMode } from '../layers/video-layer/video-layer.component';
import {
  resolvePlayMode,
  resolveStartMode,
  resolveMuted,
} from '../../utils/video-config-utils';
import { selectImageVariantForWidth } from '../../utils/image-variant-utils';

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
   * Required display width in physical pixels for image variant selection
   * (canvas view variant-by-zoom). 0 keeps the legacy first-variant pick.
   */
  @Input() targetWidth = 0;

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
   * Panel id the current layer belongs to (for video tracking + sequencing).
   */
  @Input() panelId = '';

  /**
   * Placement id used for page-view visibility observation (video sequencing).
   */
  @Input() placementId = '';

  /**
   * Index of the owning panel in `Page.readingOrder` (or -1). Drives video
   * sequencing order in page view.
   */
  @Input() readingOrderIndex = -1;

  /** Placement z-index (video sequencer fallback ordering). */
  @Input() placementZ = 0;

  /** Placement y position 0-1 (video sequencer fallback ordering). */
  @Input() placementY = 0;

  /** Placement x position 0-1 (video sequencer fallback ordering). */
  @Input() placementX = 0;

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
        // Variant-by-zoom (canvas view): the smallest variant covering the
        // required display width; targetWidth 0 keeps the legacy first pick.
        const variant = selectImageVariantForWidth(
          asset.variants as ImageVariant[],
          this.targetWidth
        );
        return variant?.src ?? asset.variants[0].src;
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
   * The forward (non-reverse) video variant, falling back to the first
   * variant. Single source of truth for forward-variant selection (used by
   * both {@link getVideoSrc} and {@link getVideoStreaming}).
   */
  private forwardVideoVariant(
    asset: AssetCatalogItemVideo | null
  ): VideoVariant | undefined {
    return (
      asset?.variants?.find((v) => v.direction !== 'reverse') ??
      asset?.variants?.[0]
    );
  }

  /** The reverse video variant for pingpong, if any. */
  private reverseVideoVariant(
    asset: AssetCatalogItemVideo | null
  ): VideoVariant | undefined {
    return asset?.variants?.find((v) => v.direction === 'reverse');
  }

  /**
   * Get the forward (default) video source URL. Catalog and direct-src paths
   * both return the RAW src — baseUrl resolution (and skipping already-absolute
   * URLs) is owned downstream by `pw-video-layer` (`resolveUrl`), so prefixing
   * here would double-apply it.
   */
  getVideoSrc(): string {
    if (this.layer.kind !== 'video') return '';

    const forward = this.forwardVideoVariant(this.getVideoAsset());
    if (forward) {
      return forward.src;
    }

    // Fall back to direct src if provided.
    const src = (this.layer as Record<string, unknown>)['src'];
    return typeof src === 'string' ? src : '';
  }

  /**
   * Get the reverse-variant URL for pingpong (empty string if none). Raw src;
   * resolved downstream by `pw-video-layer`, same as {@link getVideoSrc}.
   */
  getVideoReverseSrc(): string {
    return this.reverseVideoVariant(this.getVideoAsset())?.src ?? '';
  }

  /**
   * Get the poster URL for the video (empty string if none). Sourced from
   * the catalog asset's `poster.src` (schema 1.1+); resolved against the
   * renderer's `baseUrl` downstream by `pw-video-layer`, same as
   * `getVideoSrc()`.
   */
  getVideoPoster(): string {
    const asset = this.getVideoAsset();
    return asset?.poster?.src ?? '';
  }

  /**
   * Whether the active (forward) video variant is streaming/HLS.
   */
  getVideoStreaming(): boolean {
    return this.forwardVideoVariant(this.getVideoAsset())?.streaming === true;
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
   * Catalog asset id of the current video layer (empty string if none).
   */
  getVideoAssetId(): string {
    const assetId = (this.layer as Record<string, unknown>)['assetId'];
    return typeof assetId === 'string' ? assetId : '';
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
   * Effective TextStyle for a text layer: styleRef preset from
   * settings.typography.textStyles (schema 1.3+) merged with the layer's
   * inline `style` object (inline fields win). Unknown styleRefs are ignored.
   */
  private resolveTextStyle(): Record<string, unknown> {
    const layer = this.layer as Record<string, unknown>;
    const styleRef = layer['styleRef'];
    const preset = typeof styleRef === 'string'
      ? this.manifestService.getManifest()?.settings?.typography?.textStyles?.[styleRef]
      : undefined;
    const inline = layer['style'];
    return {
      ...(preset ?? {}),
      ...(inline && typeof inline === 'object' ? inline as Record<string, unknown> : {}),
    };
  }

  /**
   * Get text styles
   */
  getTextStyles(): Record<string, string> {
    if (this.layer.kind !== 'text') return {};

    const styles: Record<string, string> = {};
    const layer = this.layer as Record<string, unknown>;

    // Schema TextStyle (styleRef preset + inline style object) first; flat
    // editor props below keep their historical precedence and win over it.
    const textStyle = this.resolveTextStyle();
    if (textStyle['font']) {
      styles['font-family'] = textStyle['font'] as string;
    }
    if (textStyle['sizePt']) {
      styles['font-size'] = `${textStyle['sizePt']}pt`;
    }
    if (textStyle['color']) {
      styles['color'] = textStyle['color'] as string;
    }
    if (textStyle['weight']) {
      styles['font-weight'] = `${textStyle['weight']}`;
    }
    if (textStyle['align']) {
      styles['text-align'] = textStyle['align'] as string;
    }
    if (textStyle['strokeColor'] && textStyle['strokeWidth']) {
      styles['-webkit-text-stroke'] = `${textStyle['strokeWidth']}px ${textStyle['strokeColor']}`;
      styles['paint-order'] = 'stroke fill';
    }

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
